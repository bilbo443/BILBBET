const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const app=fs.readFileSync('js/app.js','utf8');
const code=app.slice(app.indexOf('  function d1DroughtDays('),app.indexOf('  function streakTeam('));
const read=n=>JSON.parse(fs.readFileSync('data/'+n+'.json'));
const engine=require('../js/streak-specials.js'),div='ELIZA CUP (D1)',roster=read('h2h_divisions'),schedule=read('h2h_schedule'),real=read('real_results');
const ctx={Number,Date,Intl,DATA:{roster_rules:read('roster_rules')},ROUND_DATES:read('round_dates'),state:{currentRound:5},streakTeam:()=>({name:'JARVIS ZEBRAS'}),H2H_SCHEDULE:schedule,REAL_RESULTS:real,esc:String,
 streakHistory:(d,r)=>engine.history(roster[d],schedule[d],real,r,1,26)};
vm.createContext(ctx);vm.runInContext(code,ctx);
assert.match(ctx.renderD1DroughtTracker('JARVIS ZEBRAS','X',5),/4 consecutive/);
assert.equal(ctx.renderD1DroughtTracker('A','B',5),'');
assert.match(ctx.renderD1DroughtTracker('JARVIS ZEBRAS','X',12),/Through Round 4/,'Future viewing must not count unplayed weeks');
const pair=schedule[div][3].find(p=>p.includes('JARVIS ZEBRAS')),opp=pair.find(t=>t!=='JARVIS ZEBRAS');
real['JARVIS ZEBRAS'][3]=real[opp][3];
assert.match(ctx.renderD1DroughtTracker('JARVIS ZEBRAS','X',5),/4 consecutive/);
assert(!ctx.renderD1DroughtTracker('JARVIS ZEBRAS','X',5).includes('straight losses'));
real['JARVIS ZEBRAS'][3]=real[opp][3]+1;
assert.match(ctx.renderD1DroughtTracker('JARVIS ZEBRAS','X',5),/drought broken/);
assert(!ctx.renderD1DroughtTracker('JARVIS ZEBRAS','X',5).includes('days without a D1 win')); 
real['JARVIS ZEBRAS'][3]=null;
assert.equal(ctx.renderD1DroughtTracker('JARVIS ZEBRAS','X',5),'');
console.log('PASS: Jarvis ID tracker, verified winless run, draw/win reset, missing scores and future cutoff.');

const history=ctx.DATA.roster_rules.d1_drought_history['002'];
assert.deepEqual(JSON.parse(JSON.stringify(ctx.d1DroughtDays(history,'2026-11-20'))),{min:657,max:658});
assert.equal(ctx.d1DroughtDays(history,'2024-01-01'),null);
assert.equal(ctx.d1DroughtDays(null,'2026-11-20'),null);
console.log('PASS: historical round-window day range and pre-anchor rejection.');
