const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('js/app.js','utf8'),ctx={DATA:{real_results:{A:[80]},roddy_results:{A:[80]}},FUTURES:{futures_refresh:{coverage:['D1','RODDY','FA CUP','ECL'],source_scores:[['A',[80],[80]]]}},H2H_DIVISIONS:{D1:['A']}};
vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('  function assertFuturesScoreFreshness(){'),source.indexOf('  async function syncPricesIfNeeded(')),ctx);
ctx.assertFuturesScoreFreshness();ctx.DATA.real_results.A.push(90);assert.throws(()=>ctx.assertFuturesScoreFreshness(),/out of date/);ctx.DATA.real_results.A.pop();ctx.FUTURES.futures_refresh.coverage.pop();assert.throws(()=>ctx.assertFuturesScoreFreshness(),/incomplete/);
console.log('PASS: current complete futures allowed; new results and missing ECL block price publication.');
