const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const s=fs.readFileSync('js/app.js','utf8');const ctx={state:{currentRound:5},H2H_DIVISIONS:{D1:['A','B'],D2:['C','D']},REAL_RESULTS:{A:[80,90,100,110,999],B:[80,90,100,110,999],C:[null,40,50,60,999],D:[null,40,50,60,999]},ALEAGUE_MIN_ROUNDS:3};vm.createContext(ctx);vm.runInContext(s.slice(s.indexOf('  function computeLiveALeagueBaseline('),s.indexOf('  function renderPointProjection(')),ctx);
assert.equal(ctx.computeLiveALeagueBaseline('D1'),95);assert.equal(ctx.computeLiveALeagueBaseline('D2'),50);
assert.equal(ctx.computeLiveALeagueBaseline('D2',4),null);ctx.REAL_RESULTS.D[3]=null;assert.equal(ctx.computeLiveALeagueBaseline('D2'),null);
assert.equal(ctx.computeLiveALeagueBaseline('UNKNOWN'),null);
console.log('PASS: separate division means, incomplete rounds excluded, minimum three completed rounds, no current/future scores.');
