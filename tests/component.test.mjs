import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement: h, act, useState } = await import('react');
const { createRoot } = await import('react-dom/client');
const { Inspector } = await import('../dist/esm/index.js');

function mount(t, element) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  t.after(() => {
    act(() => root.unmount());
    host.remove();
  });
  return { host, render: (node) => act(() => root.render(node)) };
}

test('expansion buttons update only through the controlled callback', (t) => {
  const events = [];
  function Demo() {
    const [paths, setPaths] = useState(['$']);
    return h(Inspector, {
      value: { nested: { answer: 42 } },
      expandedPaths: paths,
      onExpandedPathsChange: (next, path, expanded) => {
        events.push([path, expanded]);
        setPaths(next);
      },
    });
  }
  const { host } = mount(t, h(Demo));
  const nested = host.querySelector('[aria-label=\'Toggle $["nested"]\']');
  assert.equal(nested.getAttribute('aria-expanded'), 'false');
  act(() => nested.click());
  assert.match(host.textContent, /answer/);
  assert.equal(nested.getAttribute('aria-expanded'), 'true');
  act(() => nested.click());
  assert.doesNotMatch(host.textContent, /answer/);
  assert.deepEqual(events, [
    ['$["nested"]', true],
    ['$["nested"]', false],
  ]);
});

test('search input dispatches changes and finds collapsed descendants safely', (t) => {
  let getterCalls = 0;
  const value = {
    deep: { target: 'found' },
    get bad() {
      getterCalls++;
    },
  };
  function Demo() {
    const [query, setQuery] = useState('');
    return h(Inspector, {
      value,
      expandedPaths: [],
      showSearch: true,
      query,
      onQueryChange: setQuery,
    });
  }
  const { host } = mount(t, h(Demo));
  const input = host.querySelector('input');
  act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
      input,
      'found',
    );
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.equal(input.value, 'found');
  assert.match(host.textContent, /\$\["deep"\]\["target"\]/);
  assert.equal(getterCalls, 0);
});

test('copy callbacks receive exact escaped paths; failures reach onCopyError', async (t) => {
  const copies = [];
  const errors = [];
  const { host, render } = mount(
    t,
    h(Inspector, {
      value: { 'a.b': 1 },
      enableCopy: true,
      onCopyPath: (formatted, path) => copies.push([formatted, path]),
    }),
  );
  await act(async () => host.querySelectorAll('button')[2].click());
  assert.deepEqual(copies, [['$["a.b"]', ['a.b']]]);
  render(
    h(Inspector, {
      value: 1,
      enableCopy: true,
      onCopyPath: async () => {
        throw Error('denied');
      },
      onCopyError: (error) => errors.push(error.message),
    }),
  );
  await act(async () => host.querySelector('button').click());
  assert.deepEqual(errors, ['denied']);
});

test('circular, depth-limited and markup-like values are accessible text', (t) => {
  const value = { html: '<img src=x>', child: {} };
  value.self = value;
  const { host, render } = mount(t, h(Inspector, { value }));
  assert.equal(host.querySelector('img'), null);
  assert.match(host.textContent, /Circular/);
  render(h(Inspector, { value, maxDepth: 0 }));
  assert.match(host.querySelector('[role="status"]').textContent, /limited/);
  assert.equal(host.querySelector('button'), null);
});

test('custom values and read-only expansion render without hidden state', (t) => {
  const { host } = mount(
    t,
    h(Inspector, {
      value: { a: 1 },
      renderValue: (row) => h('em', null, row.summary),
      showSearch: true,
    }),
  );
  assert.equal(host.querySelector('button').disabled, true);
  assert.equal(host.querySelector('input').readOnly, true);
  assert.equal(host.querySelectorAll('em').length, 2);
});
