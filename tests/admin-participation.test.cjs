const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const app=fs.readFileSync('js/app.js','utf8');
const part=(name)=>{
 const re=new RegExp('  (?:async )?function '+name+'\\('),start=app.search(re);assert(start>=0,name);
 const tail=app.slice(start),next=/\n  (?:async )?function /.exec(tail.slice(1));
 return next?tail.slice(0,next.index+1):tail;
};
let alerts=[],writes=0,rpcCalls=0;
const ctx={DIV3_CONFERENCES:['DIVISION 3A','DIVISION 3B'],state:{user:{username:'admin',isAdmin:true},slip:[{id:'keep'}],preseasonPending:{keep:true},tippingPending:{keep:true}},alert:s=>alerts.push(s),render:()=>{},collectingTrustedPrices:false,EMBED_MODE:false,
 trustedPrices:new Map(),formatOdds:n=>Number(n).toFixed(2),esc:String,refreshSubmissionControls:()=>{writes++;throw Error('Must not reach submission controls');},sessionStorage:{setItem:()=>writes++,removeItem:()=>{}},supabaseClient:{rpc:async()=>{rpcCalls++;return {data:{user:{username:'admin',isAdmin:true},bets:[]},error:null};}},showPlacementReceipt:()=>{}};
vm.createContext(ctx);
for(const n of ['adminParticipationBlocked','rejectAdminParticipation','adminParticipationNotice','surpriseMe','togglePreseasonPick','setPendingTip','toggleMrMedianPick','makeMultiFromTips','confirmPreseasonPicks','confirmTips','submitBetsAtomically','sendPlacementRequest','placeBet','placeBetsAsSingles','slipBar','priceOnlyButton'])vm.runInContext(part(n),ctx);
(async()=>{
 const before=JSON.stringify(ctx.state);
 for(const n of ['surpriseMe','togglePreseasonPick','setPendingTip','toggleMrMedianPick','makeMultiFromTips','confirmPreseasonPicks','confirmTips','placeBet','placeBetsAsSingles'])await ctx[n]();
 assert.equal(writes,0);assert.equal(rpcCalls,0);assert.equal(JSON.stringify(ctx.state),before);assert.equal(alerts.length,9);
 await assert.rejects(ctx.submitBetsAtomically([]),/Admin accounts cannot place bets/);
 const request={id:'probe',username:'admin',bets:[],round:5,storageKey:'probe'};
 await assert.rejects(ctx.sendPlacementRequest(request),/Admin accounts cannot place bets/);assert.equal(rpcCalls,0);
 await ctx.sendPlacementRequest(request,true);assert.equal(rpcCalls,1,'Recovery-only reads remain available');
 assert(ctx.slipBar().includes('betting and tipping are disabled'));assert(!ctx.slipBar().includes('place-bet'));
 const quote=ctx.priceOnlyButton('TEST','Test',{odds:2,suspended:false});assert(quote.includes('2.00'));assert(!quote.includes('data-pick='));
 ctx.collectingTrustedPrices=true;assert(ctx.priceOnlyButton('TEST','Test',{odds:2,suspended:false}).includes('data-pick="TEST"'),'Admin price publication must still collect offers');
 ctx.collectingTrustedPrices=false;ctx.state.user={username:'ordinary',isAdmin:false};assert(!ctx.adminParticipationBlocked());assert(!ctx.rejectAdminParticipation());assert(ctx.priceOnlyButton('TEST','Test',{odds:2,suspended:false}).includes('data-pick="TEST"'));
 ctx.state.user=null;assert(!ctx.adminParticipationBlocked());
 const sql=fs.readFileSync('supabase/admin-no-participation.sql','utf8');
 assert(sql.includes('bilbbet_private.is_admin()'));assert(sql.includes("'bilbbet2_tips_'||who||'_R'"));assert(sql.includes("'bilbbet2_preseason_'||who"));assert(!/DELETE FROM|UPDATE public\.kv_store|INSERT INTO public\.kv_store/i.test(sql));
 assert(app.includes('isRoundBlocked(round)||adminParticipationBlocked()'));assert(app.includes('isRoundBlocked(1)||adminParticipationBlocked()'));
 assert(app.includes('if(rejectAdminParticipation())return;\n      const id = el.dataset.pick;'));
 console.log('PASS: all admin participation handlers stop before mutation/RPC, recovery-only remains readable, UI blocks submission, publication still collects quotes, ordinary/guest roles unaffected.');
})().catch(error=>{console.error(error);process.exitCode=1});
