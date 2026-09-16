// Local integration only: never loads or accepts a remote database or Redis endpoint.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
function localTestEnvironment(){
 const url=new URL(process.env.DATABASE_URL||'http://invalid');
 if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!='/nexustaff_test')throw Error('Only configured local nexustaff_test is permitted.');
 if(!process.env.PIN_ENCRYPTION_KEY||process.env.PIN_ENCRYPTION_KEY.trim().length<16)throw Error('Existing TEST PIN_ENCRYPTION_KEY required.');
 const file=path.resolve(__dirname,'../.local-integration-secrets.json');
 if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({PIN_LOOKUP_KEY:crypto.randomBytes(32).toString('hex'),JWT_SECRET:crypto.randomBytes(32).toString('hex')}),{flag:'wx'});
 const secrets=JSON.parse(fs.readFileSync(file,'utf8'));
 Object.assign(process.env,secrets,{NODE_ENV:'development',REDIS_URL:'redis://127.0.0.1:6379/15',CORS_ORIGIN:'http://localhost:3100',PORT:'3101'});
 delete process.env.BOOTSTRAP_ADMIN_ON_START;
 return process.env;
}
module.exports={localTestEnvironment};
if(require.main===module){try{const env=localTestEnvironment();const child=cp.spawn(process.execPath,process.argv.slice(2),{env,stdio:'inherit',cwd:path.resolve(__dirname,'..')});child.on('exit',code=>process.exitCode=code??1);}catch{console.error('Local test environment unavailable; verify the isolated database and TEST encryption configuration.');process.exitCode=1;}}
