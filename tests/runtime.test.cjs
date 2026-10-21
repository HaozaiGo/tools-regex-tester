const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/regex-worker.js'), 'utf8');
function run(pattern, flags, text, replacement = '', mode = 'test', forbidReplace = false) {
  let result;
  const context = vm.createContext({performance, self: {postMessage: value => result = value}});
  vm.runInContext(source, context);
  if (forbidReplace) vm.runInContext('String.prototype.replace = function () { throw new Error("REPLACE_CALLED"); };', context);
  context.self.onmessage({data: {pattern, flags, text, replacement, mode}});
  return result;
}
test('global and non-global replacement counts match actual output', () => {
  const all = run('a', 'g', 'aaa', 'b', 'replace');
  assert.equal(all.result, 'bbb'); assert.equal(all.matches.length, 3);
  const one = run('a', '', 'aaa', 'b', 'replace');
  assert.equal(one.result, 'baa'); assert.equal(one.matches.length, 1);
});
test('Unicode zero-width matches advance by code point', () => {
  assert.deepEqual(Array.from(run('(?:)', 'gu', '😀').matches, m => m.index), [0, 2]);
});
test('literal whitespace, named groups and invalid flags', () => {
  assert.equal(run(' ', 'g', 'a b').matches.length, 1);
  assert.equal(run('(?<word>a)', 'g', 'a').matches[0].namedGroups.word, 'a');
  assert.match(run('a', 'gg', 'a').error, /flags/);
  assert.ok(run('[', '', 'a').error);
});
test('large match sets are capped and marked as truncated', () => {
  const result = run('a', 'g', 'a'.repeat(10001));
  assert.equal(result.matches.length, 10000); assert.equal(result.truncated, true);
});
test('truncated replacement sets are rejected before String.replace', () => {
  const result = run('a', 'g', 'a'.repeat(10001), '', 'replace', true);
  assert.equal(result.errorCode, 'TOO_MANY_REPLACEMENTS');
  assert.equal(result.result, undefined);
});
test('large literal output is rejected before allocating the replacement', () => {
  const result = run('a{1000}', 'g', 'a'.repeat(1000000), 'b'.repeat(100000), 'replace', true);
  assert.equal(result.errorCode, 'REPLACEMENT_TOO_LARGE');
});
test('prefix, suffix, full-match and capture expansions are bounded', () => {
  for (const [pattern, text, replacement] of [
    ['x', 'a'.repeat(100000) + 'x', '$`'],
    ['x', 'x' + 'a'.repeat(100000), "$'"],
    ['a+', 'a'.repeat(100000), '$&'],
    ['(a+)', 'a'.repeat(100000), '$1'],
    ['(a+)', 'a'.repeat(100000), '$01'],
    ['(?<all>a+)', 'a'.repeat(100000), '$<all>'],
  ]) {
    const result = run(pattern, '', text, replacement.repeat(20), 'replace', true);
    assert.equal(result.errorCode, 'REPLACEMENT_TOO_LARGE', replacement);
  }
});
test('allowed replacements retain native JS dollar-token semantics', () => {
  for (const replacement of ['$$', '$&', '$`', "$'", '$1', '$01', '$10', '$<word>', '$<missing>', '$$$&', '$$`', '$0']) {
    const pattern = '(?<word>a)', text = 'before a after a';
    const result = run(pattern, 'g', text, replacement, 'replace');
    assert.equal(result.result, text.replace(new RegExp(pattern, 'g'), replacement), replacement);
  }
  const text = 'a'.repeat(100000) + 'x', replacement = '$$'.repeat(10000);
  assert.equal(run('x', '', text, replacement, 'replace').result, text.replace(/x/, replacement));
});
