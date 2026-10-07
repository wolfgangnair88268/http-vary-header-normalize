import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeVary,
  varyFields,
  canonicalizeField,
  mergeVary,
  VARY_WILDCARD,
} from '../src/index.js';

test('normalizeVary lowercases and joins a simple list', () => {
  assert.equal(normalizeVary('Accept-Encoding, Accept-Language'),
    'accept-encoding,accept-language');
});

test('normalizeVary tolerates messy whitespace and repeated commas', () => {
  assert.equal(normalizeVary('  Host ,, , Accept-Encoding  ,'),
    'accept-encoding,host');
});

test('normalizeVary drops duplicates preserving set semantics', () => {
  assert.equal(normalizeVary('Accept, accept, ACCEPT'), 'accept');
});

test('normalizeVary returns the wildcard sentinel for a sole asterisk', () => {
  assert.equal(normalizeVary('*'), VARY_WILDCARD);
  assert.equal(normalizeVary(' * '), VARY_WILDCARD);
});

test('normalizeVary collapses any list containing asterisk to the wildcard', () => {
  assert.equal(normalizeVary('Accept, *, Accept-Language'), VARY_WILDCARD);
});

test('normalizeVary returns empty string for empty or whitespace input', () => {
  assert.equal(normalizeVary(''), '');
  assert.equal(normalizeVary('   '), '');
  assert.equal(normalizeVary(' , , '), '');
});

test('normalizeVary accepts an array of header values', () => {
  assert.equal(normalizeVary(['Accept', 'Accept-Language']),
    'accept,accept-language');
});

test('normalizeVary silently drops field names with invalid token characters', () => {
  // "X-Custom:oops" is not a valid RFC 9110 token because of the colon.
  assert.equal(normalizeVary('Accept, X-Custom:oops, Host'), 'accept,host');
});

test('varyFields returns a sorted unique array, not a joined string', () => {
  assert.deepEqual(varyFields('Host, accept, Host'), ['accept', 'host']);
});

test('varyFields returns ["*"] when the wildcard is present', () => {
  assert.deepEqual(varyFields('Accept, *'), ['*']);
});

test('canonicalizeField lowercases a valid token and rejects garbage', () => {
  assert.equal(canonicalizeField('Accept-Encoding'), 'accept-encoding');
  assert.equal(canonicalizeField('X-Foo_Bar'), 'x-foo_bar');
  assert.equal(canonicalizeField('Bad Token'), '');
  assert.equal(canonicalizeField(''), '');
});

test('mergeVary unions multiple sources and de-duplicates', () => {
  assert.equal(mergeVary(['Accept, Accept-Language', 'Host, accept']),
    'accept,accept-language,host');
});

test('mergeVary returns the wildcard if any source is the wildcard', () => {
  assert.equal(mergeVary(['Accept', '*', 'Host']), VARY_WILDCARD);
});

test('mergeVary returns empty string for no inputs', () => {
  assert.equal(mergeVary([]), '');
  assert.equal(mergeVary(['', '  ']), '');
});
