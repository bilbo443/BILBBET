const fs=require('fs'),vm=require('vm'),assert=require('assert');
const s=fs.readFileSync('js/app.js','utf8');
let calls=0;const ctx={setTimeout:fn=>fn(),computeH2HMarket:(a,b,r)=>{calls++;assert.equal(r,4);return {aWinPct:55,bWinPct:40,drawPct:5}},toOdds:p=>({odds:Math.round(100/(p*1.05)*100)/100,suspended:false})};
vm.createContext(ctx);vm.runInContext(s.slice(s.indexOf('  function h2hCsvCell('),s.indexOf('  function h2hSubTabBar(')),ctx);
(async()=>{
 assert.equal(ctx.h2hCsvOdds(1.005),'1.005');
 let result=await ctx.buildH2HMatrixCsv(['A','B','C'],4,new Map());assert.equal(calls,3);assert.equal(result.counts.model,3);
 let lines=result.csv.slice(1).trimEnd().split('\r\n');assert.equal(lines.length,4);assert(lines[1].startsWith('"A","","1.73","1.73"'));assert(lines[2].startsWith('"B","2.38","","1.73"'));
 const quotes=new Map([
 ['H2H|res-a|R4|B|A',{baseOdds:3,prices:[3],odds:3}],
 ['H2H|res-b|R4|B|A',{baseOdds:1.5,prices:[1.5,1.88],odds:1.88}],
 ['H2H|res-draw|R4|B|A',{baseOdds:20,prices:[20],odds:20}]
 ]);
 calls=0;result=await ctx.buildH2HMatrixCsv(['A','B'],4,quotes);assert.equal(calls,0);assert.equal(result.counts.published,1);assert(result.csv.includes('"A","","1.50"'));assert(result.csv.includes('"B","3.00",""'));
 quotes.get('H2H|res-a|R4|B|A').bettable=false;result=await ctx.buildH2HMatrixCsv(['A','B'],4,quotes);assert.equal(calls,0);assert.equal(result.counts.unavailable,1);assert(result.csv.includes('UNAVAILABLE'));
 assert.equal(ctx.h2hCsvCell('A,"B"',true),'"A,""B"""');assert.equal(ctx.h2hCsvCell('=FORMULA()',true),'"\'=FORMULA()"');
 await assert.rejects(ctx.buildH2HMatrixCsv(['A','B'],4,new Map(),()=>{},()=>true),/cancelled/);
 calls=0;const teams=Array.from({length:66},(_,i)=>'Team '+String(i).padStart(2,'0'));result=await ctx.buildH2HMatrixCsv(teams,4,new Map());assert.equal(calls,2145);assert.equal(result.csv.slice(1).trimEnd().split('\r\n').length,67);
 console.log('PASS: 66-team grid, one calculation per pair, orientation, ordinary prices, paused markets, CSV escaping and cancellation');
})().catch(e=>{console.error(e);process.exitCode=1});
