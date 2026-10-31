import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  inspectValue,
  summarizeValue,
  formatInspectorPath,
  INSPECTOR_LIMITS,
} from '../dist/esm/index.js';

test('summarizes all primitive types without coercing objects', () => {
  for (const [value, summary] of [
    [null, 'null'],
    [undefined, 'undefined'],
    [-0, '-0'],
    [NaN, 'NaN'],
    [12n, '12n'],
    [true, 'true'],
    ['a', '"a"'],
  ]) {
    assert.equal(summarizeValue(value), summary);
  }
  assert.equal(summarizeValue(Symbol('s')), 'Symbol(s)');
  assert.equal(
    summarizeValue(() => 1),
    '[Function]',
  );
  assert.equal(
    summarizeValue({
      toString() {
        throw Error('unsafe');
      },
    }),
    'Object',
  );
});

test('path formatting distinguishes numeric indices and quoted keys', () => {
  assert.equal(
    formatInspectorPath(['a.b', 0, 'a"b', '__proto__']),
    '$["a.b"][0]["a\\"b"]["__proto__"]',
  );
  assert.equal(formatInspectorPath([]), '$');
});

test('expansion is controlled, including root collapse', () => {
  const value = { a: { b: 2 } };
  assert.equal(inspectValue(value, { expandedPaths: [] }).rows.length, 1);
  assert.equal(inspectValue(value).rows.length, 2);
  assert.equal(inspectValue(value, { expandedPaths: ['$', '$["a"]'] }).rows[2].summary, '2');
});

test('enumerates arrays and own enumerable properties, excluding prototypes and symbols', () => {
  const value = Object.create({ inherited: 2 });
  value.list = [1, 'two'];
  value[Symbol('hidden')] = 3;
  Object.defineProperty(value, 'secret', { value: 4 });
  const result = inspectValue(value, { expandedPaths: ['$', '$["list"]'] });
  assert.deepEqual(
    result.rows.map((r) => r.id),
    ['$', '$["list"]', '$["list"][0]', '$["list"][1]'],
  );
});

test('never invokes getters, even in search, and flags accessor rows', () => {
  let calls = 0;
  const value = {
    get dangerous() {
      calls++;
      throw Error('unsafe');
    },
  };
  const result = inspectValue(value, { query: 'getter' });
  assert.equal(calls, 0);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].accessor, true);
});

test('circular ancestors stop but shared non-circular objects remain inspectable', () => {
  const shared = { x: 1 };
  const value = { a: shared, b: shared };
  value.self = value;
  const result = inspectValue(value, { query: 'x' });
  assert.equal(result.rows.filter((r) => r.summary === '1').length, 2);
  const circular = inspectValue(value).rows.find((r) => r.label === 'self');
  assert.equal(circular.circular, true);
  assert.equal(circular.expandable, false);
});

test('depth, children and visited-node budgets are enforced and reported', () => {
  assert.equal(inspectValue({ a: 1 }, { maxDepth: 0 }).truncated, true);
  const nodes = inspectValue({ a: 1, b: 2, c: 3 }, { maxNodes: 2, query: 'absent' });
  assert.equal(nodes.visited, 2);
  assert.equal(nodes.truncated, true);
  assert.equal(nodes.rows.length, 0);
  const children = inspectValue({ a: 1, b: 2 }, { maxChildren: 1 });
  assert.equal(children.rows.length, 2);
  assert.equal(children.truncated, true);
});

test('search traverses collapsed descendants and matches paths or summaries', () => {
  const result = inspectValue({ a: { b: 'Needle' } }, { expandedPaths: [], query: 'needle' });
  assert.deepEqual(
    result.rows.map((r) => r.id),
    ['$["a"]["b"]'],
  );
});

test('throwing and revoked proxies become unavailable without crashing', () => {
  const proxy = new Proxy(
    {},
    {
      ownKeys() {
        throw Error('blocked');
      },
    },
  );
  assert.equal(inspectValue(proxy).rows[0].summary, '[Unavailable]');
  const revocable = Proxy.revocable([], {});
  revocable.revoke();
  assert.equal(summarizeValue(revocable.proxy), '[Unavailable]');
  assert.doesNotThrow(() => inspectValue(revocable.proxy));
});

test('caps validate on empty values and public constants are frozen', () => {
  for (const options of [
    { maxDepth: -1 },
    { maxDepth: 51 },
    { maxNodes: 0 },
    { maxNodes: 10001 },
    { maxChildren: Infinity },
    { maxChildren: 1001 },
    { query: 'x'.repeat(1001) },
  ]) {
    assert.throws(() => inspectValue(null, options), RangeError);
  }
  assert.equal(Object.isFrozen(INSPECTOR_LIMITS), true);
});

test('CommonJS helpers and component match the ESM API', () => {
  const cjs = createRequire(import.meta.url)('../dist/cjs/index.js');
  assert.equal(typeof cjs.Inspector, 'function');
  assert.deepEqual(cjs.inspectValue([1, 2]), inspectValue([1, 2]));
});
