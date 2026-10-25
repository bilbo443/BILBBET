const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('js/app.js','utf8');
const grab=(name,next)=>source.slice(source.indexOf('  function '+name+'('),source.indexOf(next,source.indexOf('  function '+name+'(')));
const ctx={H2H_DIVISIONS:{'DIVISION 3A':Array(14)},TOTAL_TEAMS:66,state:{user:null,slip:[]},
 isFeaturedPick:()=>false,isOwnTeam:n=>n==='ME',sameTeam:(a,b)=>a===b,
 parsePick:id=>{const [,div,marketKey,team]=id.split('|');return {type:'fut',div,marketKey,team,group:null}},
 promotionPoolKey:x=>x,FA_CUP_PLACES:{},ECL_PLACES:{},chainOf:()=>null};
vm.createContext(ctx);
vm.runInContext(grab('placesCountFor','  // FA Cup\'s bracket places')+grab('findConflict','  function buildSlipText'),ctx);
assert.equal(ctx.placesCountFor('DIVISION 3A','miss_top3_pct'),11);
assert.equal(ctx.placesCountFor('DIVISION 3A','miss_top_half_pct'),7);
for(const n of [3,5,10])assert.equal(ctx.placesCountFor('RODDY',`roddy_miss_top${n}_pct`),66-n);
ctx.state.slip=[{id:'FUT|RODDY|roddy_top5_pct|OTHER'}];
assert.equal(ctx.findConflict('FUT|RODDY|roddy_miss_top10_pct|OTHER').reason,'nested');
ctx.state.user={username:'ME'};ctx.state.slip=[];
assert.equal(ctx.findConflict('FUT|RODDY|roddy_miss_top5_pct|ME').reason,'self-interest');
assert.equal(ctx.findConflict('FUT|RODDY|roddy_miss_top5_pct|OTHER'),null);
console.log('PASS: complement places, related finishes, own-team restriction and eligible unrelated pick');
