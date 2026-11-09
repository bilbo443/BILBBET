const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('sw.js','utf8'),handlers={},calls=[],cached=[];
let offline=false;
const response={ok:true,clone:()=>({cached:true})};
const ctx={URL,Set,Request:class{constructor(path,options){this.path=path;this.cache=options.cache;}},Response,
 self:{location:{href:'https://example.test/BILBBET/sw.js',origin:'https://example.test'},addEventListener:(event,fn)=>handlers[event]=fn,skipWaiting:()=>{},clients:{claim:async()=>{}}},
 caches:{open:async()=>({addAll:async()=>{},put:async(request)=>cached.push(request.url)}),keys:async()=>[],match:async()=>undefined,delete:async()=>{}},
 fetch:async(request,options)=>{calls.push({request,options});if(offline)throw Error('offline');return response;}};
vm.createContext(ctx);vm.runInContext(source,ctx);
async function request(path,method='GET'){
 let output;const writes=[];
 handlers.fetch({request:{url:'https://example.test'+path,method},respondWith:p=>output=p,waitUntil:p=>writes.push(p)});
 const result=output?await output:null;await Promise.all(writes);return result;
}
(async()=>{
 for(const path of ['/BILBBET/data/futures.json','/BILBBET/data/real_results.json','/BILBBET/data/roddy_results.json','/BILBBET/data/admin_teams.json'])assert.equal(await request(path),null,'Never intercept or cache score/state JSON');
 assert.equal(calls.length,0);
 assert.equal(await request('/BILBBET/js/app.js'),response);assert.equal(calls[0].options.cache,'no-cache');
 assert.equal(await request('/BILBBET/fixtures.html'),response);
 assert.equal(await request('/BILBBET/'),response);
 assert.equal(cached.length,3);
 assert.equal(await request('/BILBBET/js/app.js','POST'),null);
 offline=true;assert.equal((await request('/BILBBET/js/app.js')).status,503);
 console.log('PASS: shell-only cache, reload revalidation, no result-data interception, method guards and explicit offline fallback.');
})().catch(error=>{console.error(error);process.exitCode=1;});
