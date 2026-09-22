require('./local-test-env.cjs').localTestEnvironment();
require('ts-node/register'); require('tsconfig-paths/register');
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('crypto'),bcrypt=require('bcrypt');
const {NestFactory}=require('@nestjs/core'),{ValidationPipe}=require('@nestjs/common'),{AppModule}=require('../src/app.module');
const {PrismaService}=require('../src/infrastructure/persistence/prisma/prisma.service'),{AuthService}=require('../src/infrastructure/auth/auth.service');
const {AdminAccountsService}=require('../src/application/services/admin-accounts.service'),{StaffService}=require('../src/application/services/staff.service');
const {OnboardingService}=require('../src/application/services/onboarding.service'),{WorkShiftService}=require('../src/application/services/work-shift.service');
const {JwtStrategy}=require('../src/infrastructure/auth/jwt.strategy'),{JwtService}=require('@nestjs/jwt');
const tag=crypto.randomUUID(),password=crypto.randomUUID()+'Az!9',nextPassword=crypto.randomUUID()+'By!8';
let app,db,auth,accounts,staff,onboard,shifts,strategy,base,company,foreign,root,branch,other,owner,admin,worker,tokens,south,pilotStaff=[],manager,supervisor;
const signer=new JwtService({secret:process.env.JWT_SECRET});
async function http(path,token,method='GET',body,extra={}){const r=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data};}
async function login(user,p=password){return auth.login({email:user.email,password:p});}
async function edit(id,extra={}){const r=(await accounts.list(root)).find(r=>r.id===id);return {firstName:r.firstName,lastName:r.lastName,companyId:r.companyId,role:r.role,status:r.status,grants:r.grants.map(g=>({propertyId:g.propertyId,permissions:g.permissions})),version:r.version,...extra};}
before(async()=>{
 if(process.env.PILOT_RESTART_CHECK==='true')assert.equal(require('fs').existsSync(require('path').join(__dirname,'../.local-pilot-restart.json')),false,'Clean up the retained disposable pilot before retaining another');
 app=await NestFactory.create(AppModule,{logger:false});app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await app.listen(0,'127.0.0.1');base=await app.getUrl()+'/api/v1';
 db=app.get(PrismaService);auth=app.get(AuthService);accounts=app.get(AdminAccountsService);staff=app.get(StaffService);onboard=app.get(OnboardingService);shifts=app.get(WorkShiftService);strategy=app.get(JwtStrategy);
 assert.equal((await db.$queryRawUnsafe('SELECT current_database() AS name'))[0].name,'nexustaff_test');
 company=await db.company.create({data:{name:'Disposable pilot '+tag,taxId:tag}});foreign=await db.company.create({data:{name:'Foreign pilot '+tag,taxId:'F'+tag}});
 root=await db.user.create({data:{companyId:company.id,email:tag+'@pilot.invalid',firstName:'Pilot',lastName:'Platform',employeeNumber:tag,passwordHash:await bcrypt.hash(password,4),role:'SUPER_ADMIN'}});
 const rootToken=(await login(root)).tokens.accessToken;
 const create=await http('/locations',rootToken,'POST',{name:'Pilot North',code:'PN-'+tag,address:'Local test',timezone:'America/New_York'});assert.equal(create.status,201);branch=create.data;
 other=await db.location.create({data:{companyId:foreign.id,name:'Foreign',locationCode:'PF-'+tag,address:'Local',timezone:'UTC'}});
 const data={firstName:'Pilot',lastName:'Owner',email:'owner-'+tag+'@pilot.invalid',companyId:company.id,role:'OWNER',status:'ACTIVE',grants:[],password};
 owner=await accounts.save(null,data,root);owner=await db.user.findUnique({where:{id:owner.id}});
 admin=await accounts.save(null,{...data,email:'admin-'+tag+'@pilot.invalid',role:'LOCATION_ADMIN',grants:[{propertyId:branch.id,permissions:['PROPERTY_VIEW','TIME_VIEW','STAFF_VIEW','STAFF_EDIT']}]},root);admin=await db.user.findUnique({where:{id:admin.id}});
 const department=await onboard.createDepartment(branch.id,{name:'Operations',code:'OPS'},root),position=await onboard.createPosition(branch.id,{departmentId:department.id,name:'Staff',code:'STAFF'},root);
 worker=await onboard.create({firstName:'Pilot',lastName:'Staff',employeeNumber:'EMP-'+tag,pinCode:'492817',propertyId:branch.id,departmentId:department.id,positionId:position.id,effectiveFrom:'2020-01-01T00:00:00Z'},root);
 tokens=(await login(admin)).tokens;
});
after(async()=>{if(db){if(process.env.PILOT_RESTART_CHECK==='true'&&company&&foreign&&pilotStaff.length===20){require('fs').writeFileSync(require('path').join(__dirname,'../.local-pilot-restart.json'),JSON.stringify({tag,companyId:company.id,foreignId:foreign.id,branchId:branch.id,ownerId:owner.id,staffIds:pilotStaff}));}else for(const c of [company,foreign])if(c){await db.user.deleteMany({where:{companyId:c.id}});await db.company.delete({where:{id:c.id}});}}if(app)await app.close();});
test('password reset rejects previously issued access AND refresh tokens; new password works and old fails',async()=>{
 assert.equal((await http('/locations',tokens.accessToken)).status,200);
 await accounts.reset(admin.id,nextPassword,(await edit(admin.id)).version,root);
 assert.equal((await http('/locations',tokens.accessToken)).status,401);
 await assert.rejects(auth.refreshTokens({refreshToken:tokens.refreshToken}));await assert.rejects(login(admin));
 tokens=(await login(admin,nextPassword)).tokens;assert.equal((await http('/locations',tokens.accessToken)).status,200);
});
test('refresh credentials are not access credentials; concurrent refresh has exactly one winner',async()=>{
 assert.equal((await http('/locations',tokens.refreshToken)).status,401);
 const results=await Promise.allSettled([1,2].map(()=>auth.refreshTokens({refreshToken:tokens.refreshToken})));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 tokens=results.find(r=>r.status==='fulfilled').value;
});
test('existing token rehydrates removed permission and changed role; inactive account rejects access, refresh and login; reactivation works',async()=>{
 await accounts.save(admin.id,await edit(admin.id,{role:'SUPERVISOR',grants:[{propertyId:branch.id,permissions:['STAFF_VIEW']}]}),root);
 assert.equal((await http('/locations',tokens.accessToken)).status,403);
 assert.equal((await strategy.validate(signer.verify(tokens.accessToken))).role,'SUPERVISOR');
 await accounts.save(admin.id,await edit(admin.id,{status:'TERMINATED'}),root);
 assert.equal((await http('/staff',tokens.accessToken)).status,401);await assert.rejects(auth.refreshTokens({refreshToken:tokens.refreshToken}));await assert.rejects(login(admin,nextPassword));
 await accounts.save(admin.id,await edit(admin.id,{status:'ACTIVE'}),root);assert.equal((await login(admin,nextPassword)).user.status,undefined);
});
test('OWNER without legacy branch rows can create/edit own branch and read Staff/period routes',async()=>{
 const token=(await login(owner)).tokens.accessToken;
 const created=await http('/locations',token,'POST',{name:'Pilot South',code:'PS-'+tag,address:'Local',timezone:'America/Chicago'});assert.equal(created.status,201);south=created.data;
 assert.equal((await http('/locations/'+created.data.id,token,'PATCH',{name:'Pilot South edited'})).status,200);
 assert.equal((await http('/staff',token)).status,200);
 assert.equal((await http('/period-approvals?location_id='+branch.id,token)).status,200);
 assert.equal((await http('/locations',token,'POST',{companyId:foreign.id,name:'Invalid',address:'Local',timezone:'Mars/Olympus'})).status,403);
});
test('deactivation serializes with punches, preserves history, inactive directory supports reactivation',async()=>{
 await shifts.processPunchSequence(worker.id,branch.id,'CLOCK_IN','KIOSK_PIN',new Date());
 await assert.rejects(staff.update(worker.id,{status:'TERMINATED'},root),/open shift/);await assert.rejects(staff.remove(worker.id,root),/open shift/);
 await shifts.processPunchSequence(worker.id,branch.id,'CLOCK_OUT','KIOSK_PIN',new Date());
 const count=await db.attendanceLog.count({where:{userId:worker.id}});await staff.update(worker.id,{status:'TERMINATED'},root);
 assert.equal((await staff.findAll(undefined,root)).some(r=>r.id===worker.id),false);assert.equal((await staff.findAll(undefined,root,true)).some(r=>r.id===worker.id),true);
 await staff.update(worker.id,{status:'ACTIVE'},root);assert.equal(await db.attendanceLog.count({where:{userId:worker.id}}),count);
});
test('legacy branch delete cannot cascade away historical attendance',async()=>{
 const token=(await login(root)).tokens.accessToken,count=await db.attendanceLog.count({where:{locationId:branch.id}});
 assert.equal((await http('/locations/'+branch.id,token,'DELETE')).status,403);
 assert.equal(await db.attendanceLog.count({where:{locationId:branch.id}}),count);
});
test('OWNER creates managers and 20 Clock Ready Staff sequentially using HTTP, including Department and Position',async()=>{
 const token=(await login(owner)).tokens.accessToken;
 const grants=[{propertyId:branch.id,permissions:['PROPERTY_VIEW','TIME_VIEW','TIME_APPROVE','TIME_EDIT','STAFF_VIEW','STAFF_CREATE','STAFF_EDIT','RESET_EMPLOYEE_PIN','VIEW_EMPLOYEE_PIN']}];
 for(const role of ['ADMIN','MANAGER','LOCATION_ADMIN','SUPERVISOR']){
  const r=await http('/admin-accounts',token,'POST',{firstName:'Pilot',lastName:role,email:'lifecycle-'+role+'-'+tag+'@pilot.invalid',companyId:company.id,role,status:'ACTIVE',grants,password});assert.equal(r.status,201);
  const row=await db.user.findUnique({where:{id:r.data.id}});if(role==='MANAGER')manager=row;if(role==='SUPERVISOR')supervisor=row;
 }
 let r=await http('/onboarding/properties/'+branch.id+'/departments',token,'POST',{name:'Pilot Team',code:'PILOT'});assert.equal(r.status,201);const departmentId=r.data.id;
 r=await http('/onboarding/properties/'+branch.id+'/positions',token,'POST',{name:'Pilot Operator',code:'PILOT',departmentId});assert.equal(r.status,201);const positionId=r.data.id;
 for(let i=0;i<20;i++){
  r=await http('/onboarding/employees',token,'POST',{firstName:i===0?'=Formula, "quoted"':'Pilot',lastName:'Staff '+i,employeeNumber:'EMP-'+tag.slice(0,8)+'-'+i,...(i%2?{email:tag+'-'+i+'@pilot.invalid'}:{}),pinCode:String(530000+i),propertyId:branch.id,departmentId,positionId,effectiveFrom:'2020-01-01T00:00:00Z'});
  assert.equal(r.status,201);pilotStaff.push(r.data.id);
  const detail=await http('/onboarding/employees/'+r.data.id,token);assert.equal(detail.status,200);assert.ok(detail.data.readiness.some(p=>p.propertyId===branch.id&&p.clockReady));
 }
 assert.equal(pilotStaff.length,20);
});
test('removed Miami-equivalent Branch is denied on the NEXT HTTP request with unchanged manager token',async()=>{
 const token=(await login(manager)).tokens.accessToken,route='/attendance/punches?location_id='+branch.id;
 assert.equal((await http(route,token)).status,200);
 await accounts.save(manager.id,await edit(manager.id,{grants:[{propertyId:south.id,permissions:['TIME_VIEW','PROPERTY_VIEW']}]}),owner);
 assert.equal((await http(route,token)).status,403);
 assert.equal((await http('/attendance/punches?location_id='+south.id,token)).status,200);
 for(const role of ['OWNER','ADMIN','MANAGER','LOCATION_ADMIN','SUPERVISOR']){
  const row=await db.user.findFirst({where:{companyId:company.id,role,status:'ACTIVE',...(role==='OWNER'?{}:{email:{startsWith:'lifecycle-'}})}}),t=(await login(row)).tokens.accessToken;
  assert.equal((await http('/reports/attendance/detail.csv?period=weekly&start_date=2026-01-05&location_id='+other.id,t)).status,403);
  assert.equal((await http('/attendance/punches?location_id='+branch.id,t,'GET',undefined,{'x-property-id':other.id})).status,403);
 }
});
test('two terminals: one transition wins, loser conflicts and is audited; full two-lunch canonical sequence',async()=>{
 const id=pilotStaff[0],at=new Date('2026-01-05T14:00:00Z');
 for(const [i,action] of ['CLOCK_IN','LUNCH_START','LUNCH_END','LUNCH2_START','LUNCH2_END','CLOCK_OUT'].entries()){
  const timestamp=new Date(+at+i*3600000),results=await Promise.allSettled([1,2].map(()=>shifts.processPunchSequence(id,branch.id,action,'KIOSK_PIN',timestamp)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const rejected=results.find(r=>r.status==='rejected');assert.equal(rejected.reason.getStatus(),409);
  assert.equal(await db.attendanceLog.count({where:{userId:id,punchType:action}}),1);
 }
 assert.equal(await db.workShift.count({where:{userId:id}}),1);assert.equal(await db.workShift.count({where:{userId:id,status:'OPEN'}}),0);
 const audits=await db.auditLog.findMany({where:{actorId:id,action:'CONCURRENT_PUNCH_REJECTED'}});assert.equal(audits.length,6);assert.ok(!JSON.stringify(audits).includes('530000'));
});
test('required approval, ordered workflow, correction invalidation/reapproval and authoritative exports',async()=>{
 const {PeriodApprovalService}=require('../src/application/services/period-approval.service'),{TimeCorrectionService}=require('../src/application/services/time-correction.service'),{PeriodExportService}=require('../src/application/services/period-export.service');
 const periods=app.get(PeriodApprovalService),corrections=app.get(TimeCorrectionService),exports=app.get(PeriodExportService);
 const sup=await strategy.validate(signer.verify((await login(supervisor)).tokens.accessToken));
 await periods.configure(branch.id,[{stepName:'Supervisor review',approverRole:'SUPERVISOR'},{stepName:'Owner final review',approverRole:'OWNER'}],owner);
 const period=await periods.resolve(branch.id,'2026-01-05','weekly',owner);let review=await periods.review(period.id,owner);assert.equal(review.requireApproval,true);
 async function approve(){let r=await periods.review(period.id,sup);await periods.submit(period.id,r.reviewToken,sup);r=await periods.review(period.id,owner);for(const row of r.rows){await assert.rejects(periods.transition(row.timesheetId,row.version,'APPROVE','Cannot bypass',root));await periods.transition(row.timesheetId,row.version,'APPROVE','Supervisor reviewed',sup);}r=await periods.review(period.id,owner);for(const row of r.rows)await periods.transition(row.timesheetId,row.version,'APPROVE','Owner reviewed',owner);assert.equal((await periods.review(period.id,owner)).period.status,'CLOSED');}
 await approve();const shift=await db.workShift.findFirst({where:{userId:pilotStaff[0]}}),raw=await db.attendanceLog.findMany({where:{workShiftId:shift.id},orderBy:{id:'asc'}});
 const correction=await corrections.createCorrectionRequest({location_id:branch.id,work_shift_id:shift.id,correction_type:'INCORRECT_CLOCK_OUT',requested_timestamp:new Date(+shift.clockOutTimestamp+60000).toISOString(),reason:'Pilot correction'},owner);
 await corrections.approveCorrectionRequest(correction.id,{comments:'Verified'},owner);review=await periods.review(period.id,owner);assert.equal(review.period.status,'OPEN');assert.equal(review.rows[0].status,'CORRECTION_REQUIRED');assert.equal(review.rows[0].workedMinutes,181);await approve();
 assert.deepEqual((await db.attendanceLog.findMany({where:{workShiftId:shift.id},orderBy:{id:'asc'}})).map(r=>r.timestamp),raw.map(r=>r.timestamp));
 for(const kind of ['detail','summary']){const csv=(await exports.csv(kind,{period:'weekly',start_date:'2026-01-05',location_id:branch.id},owner)).toString();assert.match(csv,/181/);assert.match(csv,/APPROVED/);assert.match(csv,/'=Formula, ""quoted""/);assert.doesNotMatch(csv,/password|payRate|billRate/);}
 // Disabling approval invalidates prior final state and never relabels it as approved.
 await periods.setApprovalPolicy(branch.id,false,owner);review=await periods.review(period.id,owner);assert.equal(review.requireApproval,false);assert.equal(review.canSubmit,false);await assert.rejects(periods.submit(period.id,review.reviewToken,owner));
 for(const kind of ['detail','summary']){const csv=(await exports.csv(kind,{period:'weekly',start_date:'2026-01-05',location_id:branch.id},owner)).toString();assert.match(csv,/NOT_REQUIRED/);}
 const c2=await corrections.createCorrectionRequest({location_id:branch.id,work_shift_id:shift.id,correction_type:'INCORRECT_CLOCK_OUT',requested_timestamp:new Date(+shift.clockOutTimestamp+120000).toISOString(),reason:'Optional approval correction'},owner);await corrections.approveCorrectionRequest(c2.id,{},owner);
 const optional=(await exports.csv('summary',{period:'weekly',start_date:'2026-01-05',location_id:branch.id},owner)).toString();assert.match(optional,/182/);assert.match(optional,/NOT_REQUIRED/);
 await periods.setApprovalPolicy(branch.id,true,owner);await approve();
});
test('missed clock-out preserves evidence; next-day shift independent; correction supplies only effective end',async()=>{
 const id=pilotStaff[1],start=new Date('2026-02-02T14:00:00Z');const first=await shifts.processPunchSequence(id,branch.id,'CLOCK_IN','KIOSK_PIN',start);
 await shifts.processPunchSequence(id,branch.id,'CLOCK_IN','KIOSK_PIN',new Date(+start+86400000));const missed=await db.workShift.findUnique({where:{id:first.shift.id}});
 assert.equal(missed.status,'MISSED_CLOCK_OUT');assert.equal(missed.clockOutTimestamp,null);assert.equal(missed.effectiveClockOut,null);assert.equal(await db.workShift.count({where:{userId:id}}),2);
 const {TimeCorrectionService}=require('../src/application/services/time-correction.service');const corrections=app.get(TimeCorrectionService);
 const r=await corrections.createCorrectionRequest({location_id:branch.id,work_shift_id:missed.id,correction_type:'MISSED_CLOCK_OUT',requested_timestamp:new Date(+start+8*3600000).toISOString(),reason:'Verified missed exit'},owner);await corrections.approveCorrectionRequest(r.id,{},owner);
 const corrected=await db.workShift.findUnique({where:{id:missed.id}});assert.equal(corrected.clockOutTimestamp,null);assert.equal(+corrected.effectiveClockOut,+start+8*3600000);assert.equal(await db.attendanceLog.count({where:{workShiftId:missed.id}}),1);
});
test('real correction HTTP rejects worker, missing capability, foreign target and contradictory context; OWNER works without legacy assignments',async()=>{
 const shift=await db.workShift.findFirst({where:{userId:pilotStaff[0]}}),ownerToken=(await login(owner)).tokens.accessToken;
 const body={location_id:branch.id,work_shift_id:shift.id,correction_type:'INCORRECT_CLOCK_OUT',requested_timestamp:new Date(+shift.clockOutTimestamp+180000).toISOString(),reason:'HTTP authorization verification'};
 const {credentialVersion}=require('../src/infrastructure/auth/credential-version');const workerRow=await db.user.findUnique({where:{id:pilotStaff[0]}});
 const workerToken=signer.sign({sub:workerRow.id,type:'access',credentialVersion:credentialVersion(process.env.JWT_SECRET,workerRow),tokenId:crypto.randomUUID()},{expiresIn:'15m'});
 for(const route of ['/time-corrections','/admin-accounts','/period-approvals?location_id='+branch.id])assert.equal((await http(route,workerToken)).status,403);
 assert.equal((await http('/time-corrections',workerToken,'POST',body)).status,403);
 assert.equal((await http('/time-corrections',(await login(admin,nextPassword)).tokens.accessToken,'POST',body)).status,403);
 assert.equal((await http('/time-corrections',ownerToken,'POST',{...body,location_id:other.id})).status,403);
 const created=await http('/time-corrections',ownerToken,'POST',body);assert.equal(created.status,201);
 assert.equal((await http('/time-corrections/'+created.data.id,ownerToken)).status,200);
 assert.equal((await http('/time-corrections/'+created.data.id+'/approve',ownerToken,'PATCH',{}, {'x-property-id':other.id})).status,403);
 const result=await Promise.all([http('/time-corrections/'+created.data.id+'/approve',ownerToken,'PATCH',{}),http('/time-corrections/'+created.data.id+'/reject',ownerToken,'PATCH',{})]);
 assert.equal(result.filter(r=>r.status===200).length,1);assert.ok(result.some(r=>[400,409].includes(r.status)));
});
test('legacy proxy punch requires TIME_EDIT and persisted employee/branch company; invalid max-shift config rejected',async()=>{
 const row=await db.user.findFirst({where:{companyId:company.id,role:'LOCATION_ADMIN',email:{startsWith:'lifecycle-'}}});
 const token=(await login(row)).tokens.accessToken;
 await accounts.save(row.id,await edit(row.id,{grants:[{propertyId:branch.id,permissions:['PROPERTY_VIEW','TIME_VIEW']}]}),owner);
 const count=await db.attendanceLog.count({where:{locationId:branch.id}});
 assert.equal((await http('/attendance/admin-clock',token,'POST',{user_id:pilotStaff[3],location_id:branch.id,type:'CLOCK_IN',method:'MANUAL'})).status,403);
 await accounts.save(row.id,await edit(row.id,{grants:[{propertyId:branch.id,permissions:['PROPERTY_VIEW','TIME_VIEW','TIME_EDIT']}]}),owner);
 assert.equal((await http('/attendance/admin-clock',token,'POST',{user_id:pilotStaff[3],location_id:other.id,type:'CLOCK_IN',method:'MANUAL'})).status,403);
 assert.equal(await db.attendanceLog.count({where:{locationId:branch.id}}),count);
 const ownerToken=(await login(owner)).tokens.accessToken;
 for(const value of [0,-1,1.5])assert.equal((await http('/locations/'+branch.id,ownerToken,'PATCH',{maxShiftDurationMinutes:value})).status,400);
});
test('correction racing final period approval cannot leave stale approved hours',async()=>{
 const {PeriodApprovalService}=require('../src/application/services/period-approval.service'),{TimeCorrectionService}=require('../src/application/services/time-correction.service');
 const periods=app.get(PeriodApprovalService),corrections=app.get(TimeCorrectionService);
 await periods.configure(branch.id,[{stepName:'Owner final review',approverRole:'OWNER'}],owner);
 const period=await periods.resolve(branch.id,'2026-01-05','weekly',owner);
 const shift=await db.workShift.findFirst({where:{userId:pilotStaff[0]}});
 // An already approved period is invalidated first so a fresh submission can race the next correction.
 await periods.setApprovalPolicy(branch.id,false,owner);await periods.setApprovalPolicy(branch.id,true,owner);
 let review=await periods.review(period.id,owner);await periods.submit(period.id,review.reviewToken,owner);review=await periods.review(period.id,owner);
 const pending=await corrections.createCorrectionRequest({location_id:branch.id,work_shift_id:shift.id,correction_type:'INCORRECT_CLOCK_OUT',requested_timestamp:new Date(+shift.clockOutTimestamp+240000).toISOString(),reason:'Concurrent correction and period approval'},owner);
 const row=review.rows.find(r=>r.userId===pilotStaff[0])||review.rows[0];
 const results=await Promise.allSettled([periods.transition(row.timesheetId,row.version,'APPROVE','Concurrent final approval',owner),corrections.approveCorrectionRequest(pending.id,{},owner)]);
 assert.equal(results[1].status,'fulfilled');review=await periods.review(period.id,owner);
 assert.equal(review.period.status,'OPEN');assert.equal(review.rows[0].status,'CORRECTION_REQUIRED');assert.equal(review.rows[0].workedMinutes,184);
});
