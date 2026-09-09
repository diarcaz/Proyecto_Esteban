import * as assert from 'assert';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtStrategy } from '../../infrastructure/auth/jwt.strategy';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { NotificationsGateway } from '../../infrastructure/notifications/notifications.gateway';
const { io } = require('../../../../frontend/node_modules/socket.io-client');
export async function runPhase42Tests() {
  let count = 0;
  const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const actor:any={id:'manager',role:'MANAGER',companyId:'company-a',status:'ACTIVE',assignedLocationIds:[a,b],permissions:['TIME_VIEW']};
  const locations=[{id:a,companyId:'company-a'},{id:b,companyId:'company-b'}];
  const prisma:any={location:{findUnique:async({where}:any)=>locations.find(p=>p.id===where.id),findMany:async()=>locations}};
  const secret='isolated-test-key-not-used-outside-tests';
  const config={get: () => secret};
  const strategy:any={validate:async()=>actor};
  const module=await Test.createTestingModule({providers:[NotificationsGateway,{provide:ConfigService,useValue:config},{provide:JwtStrategy,useValue:strategy},{provide:PrismaService,useValue:prisma}]}).compile();
  const app=module.createNestApplication();await app.listen(0,'127.0.0.1');
  const gateway=app.get(NotificationsGateway),base=await app.getUrl();const sockets:any[]=[];
  const token=new JwtService().sign({sub:actor.id},{secret,expiresIn:300});
  async function test(name:string,fn:()=>Promise<void>){await fn();count++;console.log('PASS 4.2 '+name);}
  function connect(auth:any){const s=io(base+'/events',{auth,reconnection:false,forceNew:true,autoConnect:false});sockets.push(s);return new Promise<any>((resolve,reject)=>{s.once('connect',()=>resolve(s));s.once('connect_error',reject);s.connect();});}
  function subscribe(socket:any,data:any){return new Promise<any>((resolve,reject)=>socket.timeout(1500).emit('subscribeSupervisorAlerts',data,(err:any,res:any)=>err?reject(err):resolve(res)));}
  try {
    await test('undefined socket and principal denied without TypeError',async()=>{assert.deepStrictEqual(await gateway.handleSubscribeAlerts(undefined as any,{}),{status:'DENIED'});assert.deepStrictEqual(await gateway.handleSubscribeAlerts({} as any,{}),{status:'DENIED'});});
    await test('handshake missing token denied',async()=>{await assert.rejects(()=>connect({}));});
    await test('handshake invalid token denied',async()=>{await assert.rejects(()=>connect({token:'invalid'}));});
    const socket=await connect({token});
    await test('actual Nest socket binding accepts authorized property',async()=>{assert.equal((await subscribe(socket,{propertyId:a})).status,'OK');});
    for(const [name,payload] of [['missing',null],['malformed',[]],['legacy code',{locationCode:'ALL'}],['invalid UUID',{propertyId:123}]])await test(name+' payload denied',async()=>{assert.equal((await subscribe(socket,payload)).status,'DENIED');});
    await test('cross company property denied despite claimed assignment',async()=>{assert.equal((await subscribe(socket,{propertyId:b})).status,'DENIED');});
    await test('missing TIME_VIEW denied',async()=>{actor.permissions=[];assert.equal((await subscribe(socket,{propertyId:a})).status,'DENIED');actor.permissions=['TIME_VIEW'];});
    await test('authorized aggregate only returns scoped properties',async()=>{const received=new Promise<any>(resolve=>socket.once('subscribed',resolve));assert.equal((await subscribe(socket,{})).status,'OK');assert.deepStrictEqual((await received).propertyIds,[a]);});
    await test('delivery rechecks scope and never broadcasts cross company',async()=>{const messages:any[]=[];socket.on('attendanceAlert',(v:any)=>messages.push(v));const alert:any={id:'test',locationId:b,title:'test',message:'test',type:'LATE_ATTENDANCE'};await gateway.emitRealtimeAlert(alert);const received=new Promise<any>(resolve=>socket.once('attendanceAlert',resolve));await gateway.emitRealtimeAlert({...alert,locationId:a});assert.equal((await received).locationId,a);assert.equal(messages.length,1);});
  } finally {sockets.forEach(s=>s.disconnect());await app.close();}
  console.log(`PHASE 4.2 BACKEND: ${count} scenarios passed`);
}
if(require.main===module)runPhase42Tests().catch(e=>{console.error(e);process.exit(1);});
