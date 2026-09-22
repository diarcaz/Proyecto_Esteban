// Read-only structural audit. No credential values are selected or printed.
require('./local-test-env.cjs').localTestEnvironment();
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
const checks={
  usersWithoutCompany:`SELECT count(*)::int n FROM users WHERE company_id IS NULL AND role <> 'SUPER_ADMIN'`,
  foreignAdminGrants:`SELECT count(*)::int n FROM user_property_accesses a JOIN users u ON u.id=a.user_id JOIN locations l ON l.id=a.property_id WHERE u.role <> 'SUPER_ADMIN' AND u.company_id IS DISTINCT FROM l.company_id`,
  wrongAssignmentCompany:`SELECT count(*)::int n FROM employee_assignments a JOIN users u ON u.id=a.user_id JOIN locations l ON l.id=a.property_id WHERE u.company_id IS DISTINCT FROM l.company_id OR u.role <> 'WORKER'`,
  overlappingAssignments:`SELECT count(*)::int n FROM employee_assignments a JOIN employee_assignments b ON a.id<b.id AND a.user_id=b.user_id AND a.property_id=b.property_id AND a.active AND b.active WHERE a.effective_from<=COALESCE(b.effective_until,'infinity') AND b.effective_from<=COALESCE(a.effective_until,'infinity')`,
  multipleOpenShifts:`SELECT count(*)::int n FROM (SELECT user_id FROM work_shifts WHERE status='OPEN' GROUP BY user_id HAVING count(*)>1) s`,
  wrongLogContext:`SELECT count(*)::int n FROM attendance_logs l JOIN work_shifts s ON s.id=l.work_shift_id WHERE l.user_id<>s.user_id OR l.location_id<>s.location_id`,
  wrongTimesheetContext:`SELECT count(*)::int n FROM timesheets s JOIN timesheet_periods p ON p.id=s.timesheet_period_id JOIN users u ON u.id=s.user_id JOIN locations l ON l.id=s.location_id WHERE s.location_id<>p.location_id OR u.company_id IS DISTINCT FROM l.company_id`,
  missingAssignmentSnapshot:`SELECT count(*)::int n FROM work_shifts WHERE employee_assignment_id IS NULL`,
  invalidAssignmentSnapshot:`SELECT count(*)::int n FROM work_shifts s LEFT JOIN employee_assignments a ON a.id=s.employee_assignment_id WHERE s.employee_assignment_id IS NOT NULL AND (a.id IS NULL OR a.user_id<>s.user_id OR a.property_id<>s.location_id OR a.department_id IS DISTINCT FROM s.department_id OR a.position_id IS DISTINCT FROM s.position_id)`,
};
(async()=>{
 const name=(await db.$queryRawUnsafe('SELECT current_database() AS name'))[0].name;if(name!=='nexustaff_test')throw Error('Wrong local database');
 const results={};for(const [key,sql]of Object.entries(checks))results[key]=(await db.$queryRawUnsafe(sql))[0].n;
 const fs=require('fs'),path=require('path'),fixtureFile=path.join(__dirname,'../.local-browser-fixture.json');
 let historicalFixtureSnapshots=0;
 if(fs.existsSync(fixtureFile)){
  const fixture=JSON.parse(fs.readFileSync(fixtureFile));
  historicalFixtureSnapshots=await db.workShift.count({where:{employeeAssignmentId:null,locationId:{in:fixture.properties.map(p=>p.id)}}});
 }
 console.log(JSON.stringify({database:name,checks:results,historicalBrowserFixtureMissingSnapshots:historicalFixtureSnapshots}));
 if(results.missingAssignmentSnapshot!==historicalFixtureSnapshots||Object.entries(results).some(([key,value])=>key!=='missingAssignmentSnapshot'&&value))process.exitCode=1;
})().catch(e=>{console.error('Read-only integrity check failed: '+e.name);process.exitCode=1;}).finally(()=>db.$disconnect());
