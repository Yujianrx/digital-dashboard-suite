process.env.DASHBOARD_MODE = 'web';
const {readConfig}=await import('./config.mjs');
const {createHost}=await import('./host.mjs');
const config=readConfig(),server=createHost(config);
server.listen(config.port,config.host,()=>console.log('Dashboard web: '+config.publicOrigin));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(()=>process.exit(0));server.closeIdleConnections();});
