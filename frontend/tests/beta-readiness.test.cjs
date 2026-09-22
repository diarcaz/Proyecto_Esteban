const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), Module = require('module'), ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), { compilerOptions: { module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX, esModuleInterop:true, target:ts.ScriptTarget.ES2022 } }).outputText,f);
const resolve=Module._resolveFilename; Module._resolveFilename=function(r,...args){return resolve.call(this,r.startsWith('@/')?path.resolve(__dirname,'../src',r.slice(2)):r,...args);};
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
let state=[], cursor=0, effect, location='property-a', session={user:{role:'SUPER_ADMIN'},token:'fixture-token'}, answer=async()=>[], requests=[];
const load=Module._load;
Module._load=function(r,...args) {
  if (r === 'next/link') return ({children,...props})=>React.createElement('a',props,children);
  if (r === 'react') return { ...React, useState(initial) { const i=cursor++; if (!(i in state)) state[i]=initial; return [state[i], v=>state[i]=typeof v==='function'?v(state[i]):v]; }, useEffect(fn) { effect=fn; } };
  if (r === '@/store/use-location-store') return {useLocationStore:()=>({selectedLocationId:location})};
  if (r === '@/store/use-auth-store') return {useAuthStore:()=>session};
  if (r === '@/lib/api-client') return {attendanceApi:{list:params=>{requests.push(params);return answer();}}};
  return load.call(this,r,...args);
};
const { BetaAttendance }=require('../src/components/admin/beta-attendance.tsx');
function render(){cursor=0;return renderToStaticMarkup(BetaAttendance());}
async function fetchOnce(){render();const cleanup=effect();await new Promise(resolve=>setImmediate(resolve));cleanup();return render();}
test('attendance empty response stays empty without invented operational data',async()=>{state=[];answer=async()=>[];const html=await fetchOnce();assert.match(html,/No recorded attendance events/);assert.doesNotMatch(html,/08:00|EMP-000|EN TURNO/);assert.deepEqual(requests.at(-1),{location_id:'property-a'});});
test('attendance API failure presents error and clears earlier operational rows',async()=>{state=[];answer=async()=>[{id:'real',timestamp:'2026-09-09T12:00:00Z',punchType:'LUNCH_END',user:{firstName:'Actual',employeeNumber:'REAL-1'},location:{name:'Actual property'}}];assert.match(await fetchOnce(),/Break ended/);answer=async()=>{throw Error('API unavailable')};const html=await fetchOnce();assert.match(html,/Unable to load attendance/);assert.doesNotMatch(html,/REAL-1/);});
test('property switch hides old result immediately and ignores late responses after cleanup',async()=>{state=[];location='property-a';answer=async()=>[{id:'real',timestamp:'2026-09-09T12:00:00Z',user:{employeeNumber:'PRIVATE-A'}}];await fetchOnce();location='property-b';assert.doesNotMatch(render(),/PRIVATE-A/);let finish;answer=()=>new Promise(r=>finish=r);render();const cleanup=effect();cleanup();finish([{id:'late',user:{employeeNumber:'LATE-A'}}]);await new Promise(r=>setImmediate(r));assert.doesNotMatch(render(),/LATE-A|PRIVATE-A/);});
test('without TIME_VIEW no attendance call is started',()=>{state=[];session={user:{role:'WORKER'},token:null};requests=[];assert.match(render(),/access is not enabled/);effect();assert.equal(requests.length,0);});
test('Next production config fails closed without build API URL',()=>{const cp=require('child_process'), config=path.resolve(__dirname,'../next.config.js');let result=cp.spawnSync(process.execPath,['-e','require(process.argv[1])',config],{env:{...process.env,NODE_ENV:'production',NEXT_PUBLIC_API_URL:''},encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/NEXT_PUBLIC_API_URL is required/);result=cp.spawnSync(process.execPath,['-e','require(process.argv[1])',config],{env:{...process.env,NODE_ENV:'production',NEXT_PUBLIC_API_URL:'https://api.example.test/api/v1'},encoding:'utf8'});assert.equal(result.status,0);});
