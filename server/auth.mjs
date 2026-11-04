import {randomBytes, scryptSync, scrypt, timingSafeEqual, createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {fault} from './storage.mjs';
const derive=promisify(scrypt), hash=value=>createHash('sha256').update(value).digest('hex');
export class Auth {
  constructor(config) {
    this.config=config; this.sessions=new Map(); this.attempts=new Map();
    this.salt=randomBytes(32); this.password=scryptSync(config.adminPassword,this.salt,64);
    this.secure=config.publicOrigin.startsWith('https:');
  }
  token(req) { return /(?:^|;\s*)dashboard_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1]; }
  valid(req) {
    const token=this.token(req); if(!token)return false;
    const key=hash(token),expires=this.sessions.get(key);
    if(!expires || expires<=Date.now()) {this.sessions.delete(key);return false;}
    return true;
  }
  cookie(token,seconds) { return `dashboard_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${this.secure?'; Secure':''}`; }
  async login(req,body) {
    const now=Date.now();
    for(const [key,value] of this.attempts) if(value.until<=now)this.attempts.delete(key);
    for(const [key,expires] of this.sessions) if(expires<=now)this.sessions.delete(key);
    const ip=req.socket.remoteAddress,attempt=this.attempts.get(ip)||{count:0,until:now+15*60000};
    if(attempt.count>=10 || this.attempts.size>=10000) throw fault(429,'登录尝试过多，请稍后再试');
    attempt.count++;this.attempts.set(ip,attempt);
    const candidate=typeof body?.password==='string' && body.password.length<=1024 ? body.password : '';
    const bytes=await derive(candidate,this.salt,64);
    if(!timingSafeEqual(bytes,this.password) || body?.username!==this.config.adminUser) throw fault(401,'用户名或密码不正确');
    this.attempts.delete(ip);
    if(this.sessions.size>=1000)this.sessions.delete(this.sessions.keys().next().value);
    const token=randomBytes(32).toString('hex');this.sessions.set(hash(token),now+12*3600000);
    return this.cookie(token,12*3600);
  }
  logout(req) {const token=this.token(req);if(token)this.sessions.delete(hash(token));return this.cookie('',0);}
}
