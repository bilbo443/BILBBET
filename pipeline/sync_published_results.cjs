// Uses only the public application key, never a server credential.
const fs=require('node:fs');
const app=fs.readFileSync('js/app.js','utf8');
const key=app.match(/const SUPABASE_ANON_KEY = '([^']+)'/)?.[1];
if(!key||!key.startsWith('sb_publishable_'))throw Error('Public application key missing');
const scores=JSON.parse(fs.readFileSync('data/real_results.json','utf8'));
const latest=Math.max(0,...Array.from({length:26},(_,i)=>Object.values(scores).every(values=>Number.isFinite(values[i]))?i+1:0));
(async()=>{
 for(let attempt=0;attempt<8;attempt++){
  try{
   const response=await fetch('https://dhgkrlimitbordddcaqo.supabase.co/functions/v1/sync-published-results',{
    method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(40000)
   });
   const result=await response.json();
   if(!response.ok||!Number.isInteger(result.finalised_round)||result.finalised_round<latest)throw Error('Published snapshot is not synced yet');
   console.log('Published results synced through GW'+result.finalised_round+'; active round '+result.current_round);return;
  }catch(error){if(attempt===7)throw error;console.log('Waiting for the matching published snapshot; retrying.');await new Promise(resolve=>setTimeout(resolve,10000));}
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
