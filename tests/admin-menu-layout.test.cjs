const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('js/app.js','utf8');
const start=source.indexOf('  function renderAdminTab(){'),end=source.indexOf('  function renderAdminBetReviewQueue(',start);
const original={currentRound:5,currentSeasonLabel:'26/27',currentRoundOverride:null,adminSubTab:'season',adminPunters:[],adminBets:[],suggestions:[],novelty:[],feedback:[],seasonClosed:{},cupFixtures:{'FA CUP':[],ECL:[]},cupCalendarOverrides:{'FA CUP':{},ECL:{}},eclGroups:{A:[],B:[],C:[]},playoffFixtures:{},playoffAdminEntry:{},roundBettingOpen:true,closeScope:'h2h'};
const ctx={state:structuredClone(original),Object,Array,Number,Date,Set,Math,
 currentCupFixtureGaps:()=>[],betHasReviewableResult:()=>false,
 esc:s=>String(s),fmt:String,formatOdds:String,statusPill:String,
 deriveSeasonLabel:()=> '26/27',TIPPING_SECTIONS:['ELIZA','DIV2','DIV3'].map(key=>({key,label:key})),
 ROUND_DATES:{5:'2026-11-20'},FIXTURES_ARE_PLACEHOLDER:false,
 getCalendarDefault:()=>null,teamSearchInput:(id)=>'<input id="'+id+'">',idSafe:s=>s,
 PLAYOFF_DIVS:['DIVISION 2A','DIVISION 2B','DIVISION 3A','DIVISION 3B'],PLAYOFF_STAGES:['Quarter-Finals','Semi Finals','Final'],
 renderAdminBetReviewQueue:()=>'<section id="result-review">Resolve outstanding bets</section>',
 renderDiv3PoolPreview:()=>'',renderAdminJoinMarkets:()=>'',renderNoveltyCounterControls:()=>''};
vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
const details=(html,id)=>{const m=html.match(new RegExp('<details id="'+id+'"([^>]*)>([\\s\\S]*?)</details>'));assert(m,'Missing '+id);return {open:/\bopen\b/.test(m[1]),body:m[2]};};
const snapshot=JSON.stringify(ctx.state);let html=ctx.renderAdminTab();
assert.equal(JSON.stringify(ctx.state),snapshot,'Rendering must not write controls or settings');
for(const id of ['admin-season-archive','admin-season-prizes','admin-launch-setup','admin-round-override','admin-simulation-reminder'])assert.equal(details(html,id).open,false,id);
const archived=details(html,'admin-launch-setup').body;
for(const id of ['r1-fixture-import','import-r1-fixtures-btn','clear-r1-fixtures-btn','toggle-h2h-schedule-confirmed-btn','toggle-election-betting-btn'])assert(archived.includes('id="'+id+'"'),id);
assert(!html.includes('toggle-divisions-announced-btn'));assert(!source.includes('toggleDivisionsBtn'));
assert(!html.includes('CURTAIN DOWN'));assert(!html.includes('Division 3 and whole-league markets are held'));
for(const id of ['close-betting-btn','reopen-betting-btn','refresh-featured-fixtures','manual-betting-control-checkbox']){
 assert(html.includes('id="'+id+'"'));assert(!archived.includes('id="'+id+'"'));
}
ctx.state.currentRoundOverride=5;assert(details(ctx.renderAdminTab(),'admin-round-override').open);
ctx.state.oddsRefreshRequested=true;assert(details(ctx.renderAdminTab(),'admin-simulation-reminder').open);
ctx.state.seasonClosed.ELIZA=true;assert(details(ctx.renderAdminTab(),'admin-season-prizes').open);
ctx.state.adminSubTab='fixtures';html=ctx.renderAdminTab();assert(!details(html,'admin-finals-fixtures').open);
assert(html.includes('data-add-cupfixture="FA CUP"'));assert(html.includes('data-assign-eclgroup="A"'));
ctx.state.currentRound=24;assert(details(ctx.renderAdminTab(),'admin-finals-fixtures').open);
for(const tab of ['season','fixtures','bets','specials','punters','feedback']){ctx.state.adminSubTab=tab;assert(ctx.renderAdminTab().includes('data-adminsubtab="'+tab+'"'));}
ctx.state.adminSubTab='bets';assert(ctx.renderAdminTab().includes('id="result-review"'));
ctx.state.adminPunters=null;assert(ctx.renderAdminTab().includes('Loading'));
// Removing the dead announcement toggle must not alter legacy price guards.
assert(source.includes('const EARLY_DIV12_RELEASE = true;'));
const joinCtx={joinMarkets:[{code:'A',status:'OPEN'},{code:'B',status:'CLOSED'},{code:'C',status:'SETTLED'},{code:'D',status:'VOID'},{code:'E',status:'VOID',archived:true}],renderJoinMarkets:(admin,markets)=>markets.map(m=>'<article>'+m.code+'</article>').join('')};
vm.createContext(joinCtx);vm.runInContext(source.slice(source.indexOf('  function renderAdminJoinMarkets(){'),source.indexOf('  function renderJoinMarkets(',source.indexOf('  function renderAdminJoinMarkets(){'))),joinCtx);
const joinHtml=joinCtx.renderAdminJoinMarkets(),finished=details(joinHtml,'admin-finished-join-markets');
assert(!finished.open);assert(finished.body.includes('<article>C</article>'));assert(finished.body.includes('<article>D</article>'));
assert(!finished.body.includes('<article>A</article>'));assert(!finished.body.includes('<article>B</article>'));
assert(!joinHtml.includes('<article>E</article>'));assert(joinHtml.includes('<article>A</article>'));assert(joinHtml.includes('<article>B</article>'));
console.log('PASS: real admin renderer, collapsed launch/archive controls, visible weekly controls, active override/prize/reminder states, finals reopening, all tabs and read-only rendering.');
