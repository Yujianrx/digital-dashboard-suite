document.getElementById('loginForm').addEventListener('submit', async function(event) {
  event.preventDefault();
  const button=this.querySelector('button'),message=document.getElementById('error');
  button.disabled=true;message.textContent='';
  try {
    const fields=new FormData(this);
    const response=await fetch('./api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:fields.get('username'),password:fields.get('password')})});
    const result=await response.json();if(!response.ok)throw Error(result.message||'登录失败');
    const next=new URLSearchParams(location.search).get('next')||'/';
    const destination=new URL(next,location.origin);
    location.replace(destination.origin===location.origin && !next.includes('\\') ? destination.pathname+destination.search+(destination.hash||location.hash) : '/');
  } catch(error) {message.textContent=error.message;} finally {button.disabled=false;}
});
