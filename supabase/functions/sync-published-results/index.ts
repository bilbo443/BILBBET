import { validateSnapshot, publishedFixtures } from './model.ts';

// No caller-supplied URL, scores, round or account action is accepted.
const source='https://raw.githubusercontent.com/bilbo443/BILBBET/main/data/';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:cors});
function envMap(name:string){try{return JSON.parse(Deno.env.get(name)??'{}');}catch{return {};}}
let inflight:Promise<any>|null=null;
let cached:{at:number,result:any}|null=null;
async function synchronise(){
  const names=['real_results','roddy_results','futures','round_dates','h2h_divisions','h2h_schedule'];
  const values=await Promise.all(names.map(async name=>{
    const response=await fetch(source+name+'.json?sync='+Math.floor(Date.now()/15000),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Published snapshot is unavailable');
    return await response.json();
  }));
  const [league,roddy,futures,dates,roster,schedule]=values;
  const fixtures=publishedFixtures(roster,schedule,league);
  const snapshot=validateSnapshot(league,roddy,futures,dates);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)));
  const fingerprint=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const secret=envMap('SUPABASE_SECRET_KEYS').default??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!secret)throw Error('Server sync credential is unavailable');
  const headers:Record<string,string>={'apikey':secret,'Content-Type':'application/json'};
  if(!secret.startsWith('sb_'))headers.Authorization='Bearer '+secret;
  const response=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/rpc/bilbbet_apply_published_scores',{
    method:'POST',headers,body:JSON.stringify({p_league:league,p_dates:dates,p_fingerprint:fingerprint,p_fixtures:fixtures}),signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Error('Published results were not accepted; retained the previous server state');
  const result=await response.json();
  if(result.status==='stale_publication')throw Error('Published snapshot is older than the confirmed server results');
  return result;
}
Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return json({error:'POST required'},405);
  const keys=[...Object.values(envMap('SUPABASE_PUBLISHABLE_KEYS')),Deno.env.get('SUPABASE_ANON_KEY')].filter(Boolean);
  if(!keys.includes(request.headers.get('apikey')))return json({error:'Valid application key required'},401);
  try{
    if(cached&&Date.now()-cached.at<15000)return json(cached.result);
    inflight??=synchronise();
    const result=await inflight;cached={at:Date.now(),result};return json(result);
  }catch(error){console.error('Published results sync:',error instanceof Error?error.message:'failed');return json({error:'Could not verify published results; previous round retained.'},503);}
  finally{inflight=null;}
});
