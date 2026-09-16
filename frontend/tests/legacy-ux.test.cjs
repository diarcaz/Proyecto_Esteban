const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Module=require('module'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const resolve=Module._resolveFilename;Module._resolveFilename=function(r,...a){return resolve.call(this,r.startsWith('@/')?path.resolve(__dirname,'../src',r.slice(2)):r,...a);};
const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
let state=[],refs=[],cursor=0,refCursor=0,answer=async id=>detail(id),scope='ALL',identified,punched;
const status={employee:{employeeNumber:'EMP-T',displayName:'Test Staff'},location:{timezone:'UTC'},shiftState:{currentStatus:'NOT_CLOCKED_IN',allowedActions:['CLOCK_IN']}};
const load=Module._load;Module._load=function(r,...a){
 if(r==='react')return {...React,useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useRef(initial){const i=refCursor++;if(!(i in refs))refs[i]={current:initial};return refs[i];},useEffect:()=>{},useCallback:fn=>fn};
 if(r==='@/store/use-auth-store')return {useAuthStore:()=>({user:{role:'SUPER_ADMIN'},token:'fixture'})};
 if(r==='@/store/use-location-store')return {useLocationStore:()=>({selectedLocationId:scope})};
 if(r==='@/lib/api-client')return {staffApi:{},locationsApi:{},onboardingApi:{details:id=>answer(id)},attendanceApi:{kioskIdentify:async data=>{identified=data;return status;},kioskClock:async data=>{punched=data;return {employee:status.employee,location:status.location,timestamp:'2026-01-01T12:00:00Z',punchType:'CLOCK_IN'};}}};
 return load.call(this,r,...a);
};
const Page=require('../src/app/admin/(protected)/employees/page.tsx').default;
const staff=id=>({id,firstName:id,lastName:'Staff',employeeNumber:'EMP-'+id,status:'ACTIVE',employeeAssignments:[{propertyId:'p'}]});
const detail=id=>({...staff(id),readiness:[],assignments:[],canViewPin:false,canResetPin:false});
function tree(){cursor=refCursor=0;return Page();}
function nodes(node,predicate){if(!node||typeof node!=='object')return[];return [...(predicate(node)?[node]:[]),...React.Children.toArray(node.props?.children).flatMap(c=>nodes(c,predicate))];}
function buttons(){return nodes(tree(),n=>n.type==='button'&&n.props['aria-controls']==='staff-detail');}
const flush=()=>new Promise(r=>setImmediate(r));
function init(){state=[];refs=[];scope='ALL';tree();state[0]=[staff('A'),staff('B')];answer=async id=>detail(id);}
test('actual staff handler opens, closes and switches without retaining PIN or editor state',async()=>{init();buttons()[0].props.onClick();await flush();assert.equal(state[2].id,'A');assert.equal(buttons()[0].props['aria-expanded'],true);state[12]='private-pin';state[4]='assignment';buttons()[0].props.onClick();assert.equal(state[2],null);assert.equal(state[12],null);assert.equal(state[4],null);assert.equal(buttons()[0].props['aria-expanded'],false);buttons()[1].props.onClick();await flush();assert.equal(state[2].id,'B');});
test('closing during detail request prevents late reopening',async()=>{init();let finish;answer=()=>new Promise(r=>finish=r);buttons()[0].props.onClick();buttons()[0].props.onClick();finish(detail('A'));await flush();assert.equal(state[2],null);assert.equal(state[3],'');});
test('switching between staff ignores stale prior response',async()=>{init();const finish={};answer=id=>new Promise(r=>finish[id]=r);buttons()[0].props.onClick();buttons()[1].props.onClick();finish.B(detail('B'));await flush();finish.A(detail('A'));await flush();assert.equal(state[2].id,'B');});
test('analog and digital clock use branch timezone across date boundary',()=>{const {BranchClock}=require('../src/components/kiosk/branch-clock');const html=renderToStaticMarkup(React.createElement(BranchClock,{now:new Date('2026-01-02T02:05:06Z'),timezone:'America/New_York'}));assert.match(html,/09:05/);assert.match(html,/January 1/);assert.match(html,/Branch local analog clock/);});

const Clock=require('../src/app/clock/page.tsx').default;
function clockTree(){cursor=refCursor=0;return Clock();}
test('kiosk sends only PIN and branch for identification, then uses returned identity for allowed action and clears',async()=>{
 state=[];refs=[];clockTree();state[0]={propertyId:'p',propertyName:'Branch',locationCode:'B',timezone:'UTC'};state[2]='908172';
 const form=nodes(clockTree(),n=>n.type==='form')[0];assert.ok(form);assert.equal(nodes(form,n=>n.type==='input'&&n.props.name==='clock-staff-number').length,0);
 await form.props.onSubmit({preventDefault(){}});assert.deepEqual(identified,{pin_code:'908172',property_id:'p'});assert.equal(state[1],'ACTIONS');
 const action=nodes(clockTree(),n=>n.type==='button'&&n.props.children==='Clock In')[0];assert.ok(action);assert.equal(nodes(clockTree(),n=>n.type==='button'&&n.props.children==='Clock Out').length,0);
 await action.props.onClick();assert.equal(punched.employee_number,'EMP-T');assert.equal(punched.pin_code,'908172');assert.equal(state[2],'');assert.equal(state[1],'SUCCESS');
 nodes(clockTree(),n=>n.type==='button'&&n.props.children==='Done')[0].props.onClick();assert.equal(state[1],'IDLE');assert.equal(state[3],null);
});
