require('./local-test-env.cjs').localTestEnvironment();require('ts-node/register');require('tsconfig-paths/register');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto'),{PrismaClient}=require('@prisma/client');
const file=path.join(__dirname,'../.local-pilot-restart.json'),fixture=JSON.parse(fs.readFileSync(file)),db=new PrismaClient();
(async()=>{
 assert.equal((await db.$queryRawUnsafe('SELECT current_database() AS name'))[0].name,'nexustaff_test');
 const company=await db.company.findUnique({where:{id:fixture.companyId}}),foreign=await db.company.findUnique({where:{id:fixture.foreignId}});
 assert.equal(company?.name,'Disposable pilot '+fixture.tag);assert.equal(foreign?.name,'Foreign pilot '+fixture.tag);
 if(process.argv[2]==='cleanup'){
  for(const c of [company,foreign]){await db.user.deleteMany({where:{companyId:c.id}});await db.company.delete({where:{id:c.id}});}fs.unlinkSync(file);console.log('Only identified disposable pilot fixtures removed.');return;
 }
 const users=await db.user.findMany({where:{companyId:company.id},orderBy:{id:'asc'},select:{id:true,status:true,role:true,employeeAssignments:{orderBy:{id:'asc'}},propertyAccess:{orderBy:{id:'asc'}}}});
 const locations=await db.location.findMany({where:{companyId:company.id},orderBy:{id:'asc'},include:{operationalConfig:true}});
 const ids=locations.map(p=>p.id),shifts=await db.workShift.findMany({where:{locationId:{in:ids}},orderBy:{id:'asc'}}),logs=await db.attendanceLog.findMany({where:{locationId:{in:ids}},orderBy:{id:'asc'}}),sheets=await db.timesheet.findMany({where:{locationId:{in:ids}},orderBy:{id:'asc'},include:{approvalHistory:{orderBy:{id:'asc'}}}});
 assert.equal(users.filter(u=>fixture.staffIds.includes(u.id)).length,20);assert.ok(shifts.length>=4);assert.ok(logs.length>=10);assert.ok(sheets.length);
 const digest=crypto.createHash('sha256').update(JSON.stringify({users,locations,shifts,logs,sheets})).digest('hex');
 if(process.argv[2]==='checkpoint'){fixture.digest=digest;fs.writeFileSync(file,JSON.stringify(fixture));}else assert.equal(digest,fixture.digest,'Durable pilot business data changed across restart');
 const redis=new(require('ioredis'))(process.env.REDIS_URL);try{assert.equal(await redis.ping(),'PONG');if(process.argv[2]==='checkpoint')await redis.set('pilot_restart:'+fixture.tag,'ephemeral-check','EX',3600);console.log('PostgreSQL business snapshot verified; Redis PONG; test marker '+(await redis.get('pilot_restart:'+fixture.tag)?'retained':'absent')+'.');}finally{await redis.quit();}
})().catch(e=>{console.error('Local persistence verification failed: '+e.name);process.exitCode=1;}).finally(()=>db.$disconnect());
