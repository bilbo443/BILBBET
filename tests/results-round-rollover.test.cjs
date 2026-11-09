const fs=require('fs'),assert=require('assert/strict');
const app=fs.readFileSync('js/app.js','utf8'),sql=fs.readFileSync('supabase/results-round-rollover.sql','utf8');
assert(app.includes("const resolvedRound = Number(await secureRpc('bilbbet_current_round'))"));
assert(app.includes("const nextRound=Number(await secureRpc('bilbbet_current_round'))"));
assert(app.includes('await syncTrustedPrices(true)'));
assert(sql.includes("f->>'section' IN ('ELIZA','DIV2','DIV3')"));
assert(sql.includes("IF override IS NOT NULL THEN RETURN override"));
assert(sql.includes('least(26,greatest'));
console.log('PASS: shared server round, admin sync rollover and price refresh, league-only completion, overrides and season cap.');
