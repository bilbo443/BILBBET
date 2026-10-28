const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/app.js', 'utf8');
const helper = source.slice(source.indexOf('  async function fetchDataResponse('), source.indexOf('  async function loadAllData('));
async function run(sequence){
  const calls = [], waits = [];
  const context = {fetch:async (path, options) => {
    calls.push({path,options});
    const next = sequence.shift();
    if(next instanceof Error) throw next;
    return {status:next,ok:next === 200};
  }, setTimeout: (fn, ms) => {waits.push(ms); fn();}};
  vm.createContext(context);
  vm.runInContext(helper, context);
  return {response:await context.fetchDataResponse('./data/futures.json'),calls,waits};
}
(async () => {
  let r = await run([503,200]);
  assert.equal(r.response.status,200); assert.equal(r.calls.length,2);
  assert.equal(r.calls[1].options.cache,'reload');
  r = await run([new Error('offline'),503,200]);
  assert.equal(r.response.status,200); assert.deepEqual(r.waits,[750,1500]);
  r = await run([503,503,503]);
  assert.equal(r.response.status,503); assert.equal(r.calls.length,3);
  for(const status of [404,403]){
    r = await run([status]); assert.equal(r.calls.length,1); assert.equal(r.response.status,status);
  }
  for(const status of [408,429,500,502,504]){
    r = await run([status,200]); assert.equal(r.response.status,200);
  }
  await assert.rejects(run([new Error('offline'),new Error('offline'),new Error('offline')]),/offline/);
  assert.ok(source.includes("name === 'real_results' && res.status === 404"));
  assert.ok(source.includes("const shapeIssue = validateDataShape(name, parsed)"));
  assert.ok(source.includes("getElementById('retry-data-load').addEventListener"));
  console.log('PASS: transient recovery, bounded retries, cache refresh, permanent errors and validation retained.');
})();
