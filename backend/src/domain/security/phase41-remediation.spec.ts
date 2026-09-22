import * as assert from 'assert';
import * as bcrypt from 'bcrypt';
import { ValidationPipe, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AttendanceService } from '../../application/services/attendance.service';
import { WorkShiftService } from '../../application/services/work-shift.service';
import { LocationService } from '../../application/services/location.service';
import { AuthorizationService } from './authorization.service';
import { AttendanceController } from '../../adapters/controllers/attendance.controller';
import { LocationController } from '../../adapters/controllers/location.controller';
import { RolesAndLocationsGuard } from '../../adapters/guards/roles-and-locations.guard';
import { PermissionsGuard } from '../../adapters/guards/permissions.guard';
import { KioskClockDto, KioskStatusDto } from '../../adapters/dtos/attendance.dtos';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { AttendanceType as A, AttendanceMethod as M } from '../entities/attendance-log.entity';
const PA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', PB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const now=new Date(), authz=new AuthorizationService();
function fixture(hash:string) {
  const user:any={id:'employee',employeeNumber:'EMP-1001',firstName:'Test',lastName:'Employee',companyId:'company-a',role:'WORKER',status:'ACTIVE',pinCodeHash:hash,pinCodeEncrypted:'secret',permissions:['secret']};
  const properties=[{id:PA,companyId:'company-a',name:'A',locationCode:'CODE-A',timezone:'America/New_York',operationalConfig:{maxShiftDurationMinutes:480},_count:{assignments:1}},{id:PB,companyId:'company-b',name:'B',locationCode:'CODE-B',timezone:'Asia/Tokyo',operationalConfig:{maxShiftDurationMinutes:960},_count:{assignments:1}}];
  let shifts:any[]=[],logs:any[]=[],audits:any[]=[];
  const assignments:any[]=[PA,PB].map(propertyId=>({id:'ea-'+propertyId,userId:user.id,propertyId,active:true,effectiveFrom:new Date(0),effectiveUntil:null,departmentId:'dept',positionId:'position',rateConfigurationId:'rate',department:{id:'dept',name:'Department'},position:{id:'position',title:'Position'}}));
  const calls={reads:0,unique:0,configs:[] as string[]};
  function matches(row:any,where:any={}):boolean {return Object.entries(where).every(([key,v]:any)=>{
    if(key==='OR')return v.some((w:any)=>matches(row,w));
    if(key==='location')return matches(properties.find(p=>p.id===row.locationId),v);
    if(v&&typeof v==='object'&&!(v instanceof Date)){if('in' in v)return v.in.includes(row[key]);if('gte' in v&&row[key]<v.gte)return false;if('lte' in v&&row[key]>v.lte)return false;return true;}
    return row?.[key]===v;
  });}
  const db:any={
    user:{findUnique:async({where}:any)=>{calls.unique++;return matches(user,where)?user:null;}},
    location:{findUnique:async({where}:any)=>properties.find(p=>matches(p,where)),findMany:async({where}:any)=>properties.filter(p=>matches(p,where))},
    employeeAssignment:{findMany:async({where}:any)=>assignments.filter(a=>matches(a,where))},
    userLocationAssignment:{findFirst:async()=>({id:'legacy'})},
    propertyOperationalConfig:{findUnique:async({where}:any)=>{calls.configs.push(where.locationId);return properties.find(p=>p.id===where.locationId)?.operationalConfig;}},
    rateConfiguration:{findUnique:async()=>({id:'rate',positionId:'position',effectiveFrom:new Date(0),payRate:20,billRate:30,otPayRate:40,otBillRate:60,markupType:'PERCENTAGE',markupValue:50,minimumShiftMins:240})},
    workShift:{
      findFirst:async({where,include}:any)=>{const s=shifts.filter(s=>matches(s,where)).slice(-1)[0];if(!s)return null;return {...s,...(include?{location:properties.find(p=>p.id===s.locationId),logs:logs.filter(l=>l.workShiftId===s.id).sort((a,b)=>include.logs?.orderBy?.timestamp==='desc'?+b.timestamp-+a.timestamp:+a.timestamp-+b.timestamp)}:{})};},
      create:async({data}:any)=>{if(data.status==='OPEN'&&shifts.some(s=>s.userId===data.userId&&s.status==='OPEN'))throw Object.assign(new Error('unique'),{code:'P2002'});const s={id:'shift-'+shifts.length,...data};shifts.push(s);return s;},
      update:async({where,data}:any)=>{const s=shifts.find(s=>matches(s,where));Object.assign(s,data);return s;},
    },
    attendanceLog:{findMany:async({where}:any)=>{calls.reads++;return logs.filter(l=>matches(l,where));},findFirst:async({where}:any)=>logs.find(l=>matches(l,where))||null,create:async({data}:any)=>{const l={id:'log-'+logs.length,...data};logs.push(l);return l;}},
    auditLog:{create:async({data}:any)=>{audits.push(data);return data;}},
    $queryRaw:async()=>[],
    $transaction:async(fn:any)=>{const saved=structuredClone({shifts,logs,audits});try{return await fn(db);}catch(e){({shifts,logs,audits}=saved);throw e;}},
  };
  const counts=new Map<string,number>();
  const redis:any={getFailedAttempts:async(k:string)=>counts.get(k)||0,incrementFailedAttempts:async(k:string)=>{const n=(counts.get(k)||0)+1;counts.set(k,n);return n;},resetFailedAttempts:async(k:string)=>{counts.delete(k);}};
  const engine=new WorkShiftService(db,authz),service=new AttendanceService(db,redis,engine);
  const dto={employee_number:user.employeeNumber,pin_code:'123456',property_id:PA};
  function seed(types:A[],hours=1,property=PA){const start=new Date(+now-hours*3600000);shifts=types.length?[{id:'existing',userId:user.id,locationId:property,status:'OPEN',clockInTimestamp:start,effectiveClockIn:start,payRateApplied:500,billRateApplied:800,markupValueApplied:2}]:[];logs=types.map((punchType,i)=>({id:'prior-'+i,userId:user.id,locationId:property,workShiftId:'existing',punchType,timestamp:new Date(+start+i*60000)}));audits=[];}
  return {db,redis,user,properties,assignments,engine,service,calls,dto,seed,snapshot:()=>structuredClone({shifts,logs,audits})};
}
function safe(v:any){if(!v||typeof v!=='object'||v instanceof Date)return;for(const[k,child]of Object.entries(v)){assert(!/payRate|billRate|otPay|otBill|markup|minimumShift|rateConfiguration|pinCode|pin_code|password|permissions|companyId|propertyAccess/i.test(k),'Sensitive field: '+k);safe(child);}}
export async function runPhase41Tests(){
  let passed=0;const hash=await bcrypt.hash('123456',4);
  async function test(name:string,fn:()=>Promise<void>|void){await fn();passed++;console.log('PASS 4.1: '+name);}
  const supervisor={id:'supervisor',role:'SUPERVISOR',companyId:'company-a',assignedLocationIds:[PA],permissions:['TIME_VIEW','PROPERTY_VIEW']};
  for(const[name,query,headers,actor,allowed]of[
    ['A allowed',{location_id:PA},{},supervisor,true],['B denied',{location_id:PB},{},supervisor,false],
    ['header A query B denied',{location_id:PB},{'x-location-id':PA},supervisor,false],
    ['cross company assigned denied',{location_id:PB},{},{...supervisor,assignedLocationIds:[PB]},false],
    ['missing TIME_VIEW denied',{location_id:PA},{},{...supervisor,permissions:[]},false],
    ['SUPER_ADMIN allowed B',{location_id:PB},{},{id:'root',role:'SUPER_ADMIN'},true],
    ['OWNER scoped list allowed',{},{},{id:'owner',role:'OWNER',companyId:'company-a'},true],
    ['property permission allowed',{location_id:PA},{},{...supervisor,permissions:[],propertyAccess:[{propertyId:PA,permissions:['TIME_VIEW']}]},true],
  ]as any[])await test(name,async()=>{const f=fixture(hash),controller=new AttendanceController(f.service),req={user:actor,query,headers,body:{},params:{}};const ctx:any={getHandler:()=>controller.getPunches,getClass:()=>AttendanceController,switchToHttp:()=>({getRequest:()=>req})};const call=async()=>{assert(await new RolesAndLocationsGuard(new Reflector()).canActivate(ctx));assert(await new PermissionsGuard(new Reflector(),authz,f.db).canActivate(ctx));return controller.getPunches(query,req);};if(allowed){await call();assert.equal(f.calls.reads,1);}else{await assert.rejects(call);assert.equal(f.calls.reads,0);await assert.rejects(()=>f.service.getPunches(query,actor,headers));assert.equal(f.calls.reads,0);}});
  for(const endpoint of ['getKioskEmployeeStatus','processKioskClock']as const)await test('legacy-only rejected '+endpoint,async()=>{const f=fixture(hash);f.assignments.length=0;await assert.rejects(()=>f.service[endpoint]({...f.dto,type:A.CLOCK_IN}),ForbiddenException);assert.equal(f.snapshot().shifts.length,0);});
  await test('SUPER_ADMIN requires assignment',async()=>{const f=fixture(hash);f.assignments.length=0;f.user.role='SUPER_ADMIN';await assert.rejects(()=>f.service.processKioskClock({...f.dto,type:A.CLOCK_IN}),ForbiddenException);});
  for(const variant of ['expired','future','inactive','conflict'])await test(variant+' assignment rejected both endpoints',async()=>{const f=fixture(hash),a=f.assignments[0];if(variant==='expired')a.effectiveUntil=new Date(0);if(variant==='future')a.effectiveFrom=new Date(Date.now()+86400000);if(variant==='inactive')a.active=false;if(variant==='conflict')f.assignments.push({...a,id:'conflict',positionId:'different'});await assert.rejects(()=>f.service.getKioskEmployeeStatus(f.dto));await assert.rejects(()=>f.service.processKioskClock({...f.dto,type:A.CLOCK_IN}));});
  for(const action of Object.values(A))await test('cross-property '+action+' changes nothing',async()=>{const f=fixture(hash);f.seed([A.CLOCK_IN],9);const before=f.snapshot();await assert.rejects(()=>f.engine.getEmployeeShiftState(f.user.id,PB,now),ForbiddenException);await assert.rejects(()=>f.engine.processPunchSequence(f.user.id,PB,action,M.KIOSK_PIN,now),ForbiddenException);assert.deepStrictEqual(f.snapshot(),before);});
  const states:[string,A[],A[],number][]=[['NOT_CLOCKED_IN',[],[A.CLOCK_IN],1],['WORKING',[A.CLOCK_IN],[A.LUNCH_START,A.CLOCK_OUT],1],['ON_LUNCH',[A.CLOCK_IN,A.LUNCH_START],[A.LUNCH_END],1],['AFTER_LUNCH',[A.CLOCK_IN,A.LUNCH_START,A.LUNCH_END],[A.LUNCH2_START,A.CLOCK_OUT],1],['ON_LUNCH_2',[A.CLOCK_IN,A.LUNCH_START,A.LUNCH_END,A.LUNCH2_START],[A.LUNCH2_END],1],['AFTER_LUNCH_2',[A.CLOCK_IN,A.LUNCH_START,A.LUNCH_END,A.LUNCH2_START,A.LUNCH2_END],[A.CLOCK_OUT],1],['OVERDUE',[A.CLOCK_IN],[A.CLOCK_IN],9]];
  for(const[name,prior,expected,hours]of states)await test('parity '+name,async()=>{for(const action of Object.values(A)){const f=fixture(hash);f.seed(prior,hours);const before=f.snapshot(),state=await f.engine.getEmployeeShiftState(f.user.id,PA,now);assert.deepStrictEqual(state.allowedActions,expected);assert.deepStrictEqual(f.snapshot(),before);const exec=()=>f.engine.processPunchSequence(f.user.id,PA,action,M.KIOSK_PIN,now);if(expected.includes(action))await exec();else{await assert.rejects(exec);const after=f.snapshot();assert.deepStrictEqual(after.shifts,before.shifts);assert.deepStrictEqual(after.logs,before.logs);assert.equal(after.audits.at(-1)?.action,'CONCURRENT_PUNCH_REJECTED');}}});
  await test('overdue existing config and transactional replacement',async()=>{const f=fixture(hash);f.seed([A.CLOCK_IN],9);await f.engine.processPunchSequence(f.user.id,PA,A.CLOCK_IN,M.KIOSK_PIN,now);const r=f.snapshot();assert.equal(r.shifts[0].status,'MISSED_CLOCK_OUT');assert.equal(r.shifts[1].status,'OPEN');assert.equal(r.logs.filter(l=>l.punchType===A.CLOCK_OUT).length,0);assert.equal(r.audits.length,1);assert.deepStrictEqual(f.calls.configs,[PA]);});
  await test('overdue rollback on new log failure',async()=>{const f=fixture(hash);f.seed([A.CLOCK_IN],9);const before=f.snapshot();f.db.attendanceLog.create=async()=>{throw new Error('write failure');};await assert.rejects(()=>f.engine.processPunchSequence(f.user.id,PA,A.CLOCK_IN,M.KIOSK_PIN,now));assert.deepStrictEqual(f.snapshot(),before);});
  await test('safe responses real snapshot and EMP identifier',async()=>{const f=fixture(hash);safe(await f.service.getKioskEmployeeStatus(f.dto));const response=await f.service.processKioskClock({...f.dto,type:A.CLOCK_IN});safe(response);assert.equal(response.employee.employeeNumber,'EMP-1001');assert.equal(f.snapshot().shifts[0].payRateApplied,20);assert(response.timestamp);assert.equal(f.calls.unique,3);});
  await test('missing log never exposes fallback',async()=>{const f=fixture(hash);(f.engine as any).processPunchSequence=async()=>({shift:{payRateApplied:100},log:null});await assert.rejects(()=>f.service.processKioskClock({...f.dto,type:A.CLOCK_IN}),ServiceUnavailableException);});
  const pipe=new ValidationPipe({whitelist:true,transform:true});const validate=(data:any)=>pipe.transform(data,{type:'body',metatype:KioskClockDto});
  await test('DTO trims EMP format and accepts six digits',async()=>{const dto=await validate({employee_number:' EMP-1001 ',pin_code:'123456',property_id:PA,type:A.CLOCK_IN});assert.equal(dto.employee_number,'EMP-1001');});
  await test('DTO rejects invalid PIN UUID action or missing context',async()=>{const base={employee_number:'EMP-1001',pin_code:'123456',property_id:PA,type:A.CLOCK_IN};for(const pin_code of ['1234','12345','1234567','abcdef','123 56',123456,null])await assert.rejects(()=>validate({...base,pin_code}));for(const change of [{property_id:'invalid'},{type:'INVENTED'},{employee_number:' '},{property_id:undefined},{location_code:' ',property_id:undefined},{property_id:null}])await assert.rejects(()=>validate({...base,...change}));await validate({...base,property_id:undefined,location_code:'CODE-A'});assert.equal(Reflect.getMetadata('design:paramtypes',AttendanceController.prototype,'kioskStatus')[0],KioskStatusDto);assert.equal(Reflect.getMetadata('design:paramtypes',AttendanceController.prototype,'kioskPunch')[0],KioskClockDto);});
  for(const method of ['getFailedAttempts','incrementFailedAttempts','resetFailedAttempts'])await test('Redis '+method+' outage 503',async()=>{const f=fixture(hash);f.redis[method]=async()=>{throw new Error('private redis endpoint');};await assert.rejects(()=>f.service.getKioskEmployeeStatus(method==='incrementFailedAttempts'?{...f.dto,pin_code:'999999'}:f.dto),(e:any)=>e.getStatus()===503&&!e.message.includes('private'));});
  await test('real Redis wrapper strict failure; unrelated behavior preserved',async()=>{const redis=new RedisService({}as any);(redis as any).client={get:async()=>{throw new Error('offline');},eval:async()=>{throw new Error('offline');},del:async()=>{throw new Error('offline');}};await assert.rejects(()=>redis.getFailedAttempts('test',true),ServiceUnavailableException);await assert.rejects(()=>redis.incrementFailedAttempts('test',900,true),ServiceUnavailableException);await assert.rejects(()=>redis.resetFailedAttempts('test',true),ServiceUnavailableException);assert.equal(await redis.getFailedAttempts('other'),0);});
  await test('unknown inactive missing hash wrong PIN equivalent',async()=>{const errors:string[]=[];for(const variant of ['unknown','inactive','missing','wrong']){const f=fixture(hash);if(variant==='inactive')f.user.status='TERMINATED';if(variant==='missing')f.user.pinCodeHash=null;try{await f.service.getKioskEmployeeStatus({...f.dto,employee_number:variant==='unknown'?'UNKNOWN':f.dto.employee_number,pin_code:variant==='wrong'?'999999':'123456'});}catch(e:any){errors.push(e.getStatus()+':'+e.message);}}assert.equal(errors.length,4);assert.equal(new Set(errors).size,1);});
  await test('lockout across endpoints and properties',async()=>{const f=fixture(hash);for(let i=0;i<5;i++)await assert.rejects(()=>f.service.getKioskEmployeeStatus({...f.dto,pin_code:'999999'}));await assert.rejects(()=>f.service.processKioskClock({...f.dto,property_id:PB,type:A.CLOCK_IN}),/locked/);});
  await test('locations real code timezone and anonymous denial',async()=>{const f=fixture(hash),svc=new LocationService(f.db,authz);const rows=await svc.findAll(undefined,supervisor);assert.equal(rows.length,1);assert.equal(rows[0].code,'CODE-A');assert.equal(rows[0].timezone,'America/New_York');await assert.rejects(()=>svc.findAll());const ctx:any={getHandler:()=>LocationController.prototype.findAll,getClass:()=>LocationController,switchToHttp:()=>({getRequest:()=>({headers:{},query:{}})})};await assert.rejects(async()=>new PermissionsGuard(new Reflector(),authz,f.db).canActivate(ctx));});
  await test('P2010 and generic lock failures never swallowed',async()=>{for(const error of [Object.assign(new Error('Raw query failed'),{code:'P2010'}),new Error('connection failed')]){const f=fixture(hash);f.db.$queryRaw=async()=>{throw error;};await assert.rejects(()=>f.engine.processPunchSequence(f.user.id,PA,A.CLOCK_IN,M.KIOSK_PIN,now),/Concurrency lock failed/);assert.equal(f.snapshot().logs.length,0);}});
  await test('P2002 controlled duplicate OPEN error',async()=>{const f=fixture(hash);f.db.workShift.create=async()=>{throw Object.assign(new Error('unique'),{code:'P2002'});};await assert.rejects(()=>f.engine.processPunchSequence(f.user.id,PA,A.CLOCK_IN,M.KIOSK_PIN,now),/Duplicate OPEN/);});
  console.log('PHASE 4.1 BACKEND: '+passed+' scenarios passed');return passed;
}
if(require.main===module)runPhase41Tests().catch(e=>{console.error(e);process.exit(1);});
