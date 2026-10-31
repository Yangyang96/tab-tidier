const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = ['popup/tab-utils.js', 'popup/popup.js']
  .map(file => readFileSync(path.join(root, file), 'utf8')).join('\n');

function setup(tabs = [], overrides = {}) {
  let current = structuredClone(tabs);
  const calls = { removed: [], moved: [], ungrouped: [], confirms: [] };
  const controls = new Map(['tidy-btn', 'status', 'stats', 'search'].map(id =>
    [id, { textContent: '', value: '', disabled: false }]));
  const context = vm.createContext({
    URL, Set, Map, console,
    document: {
      addEventListener() {},
      body: { setAttribute() {} },
      getElementById: id => controls.get(id),
      querySelectorAll: () => [],
    },
    window: { confirm: message => { calls.confirms.push(message); return true; } },
    chrome: { tabs: {
      query: async () => structuredClone(current),
      remove: async id => {
        calls.removed.push(id);
        if (overrides.remove) await overrides.remove(id);
        current = current.filter(tab => tab.id !== id);
      },
      ungroup: async ids => calls.ungrouped.push(ids),
      move: async (ids, options) => calls.moved.push({ ids, options }),
    } },
  });
  vm.runInContext(source, context);
  return { context, calls, controls, run: expression => vm.runInContext(expression, context),
    setTabs: value => { current = value; } };
}
const tab = (id, extra = {}) => ({ id, url: 'https://example.org/a', windowId: 1,
  index: id, groupId: -1, ...extra });
const plain = value => JSON.parse(JSON.stringify(value));

test('dedup keeps oldest and respects exact query/hash differences', () => {
  const env = setup();
  env.context.input = [tab(1), tab(2), tab(3, { url: 'https://example.org/a?x=1' }),
    tab(4, { url: 'https://example.org/a#section' })];
  assert.deepEqual(plain(env.run('findDuplicates(input)')), [2]);
});

test('all active, pinned and audible copies survive across windows', () => {
  const env = setup();
  env.context.input = [tab(1, { active: true }), tab(2, { active: true, windowId: 2 }),
    tab(3, { pinned: true }), tab(4, { audible: true }), tab(5)];
  assert.deepEqual(plain(env.run('findDuplicates(input)')), [5]);
});

test('unknown, internal and navigating URLs are never deduplicated', () => {
  const env = setup();
  env.context.input = [tab(1, { url: undefined }), tab(2, { url: undefined }),
    tab(3, { url: 'chrome://newtab/' }), tab(4, { url: 'chrome://newtab/' }),
    tab(5, { pendingUrl: 'https://example.org/b' }), tab(6)];
  assert.deepEqual(plain(env.run('findDuplicates(input)')), []);
});

test('normal and incognito tabs never deduplicate one another', () => {
  const env = setup();
  env.context.input = [tab(1), tab(2, { incognito: true })];
  assert.deepEqual(plain(env.run('findDuplicates(input)')), []);
});

test('sort batches calls per window and leaves pinned tabs out of moves', async () => {
  const env = setup();
  env.context.input = [tab(1, { pinned: true, index: 0 }),
    tab(2, { url: 'https://z.example/', index: 1, groupId: 7 }),
    tab(3, { url: 'https://a.example/', index: 2, groupId: 7 }),
    tab(4, { windowId: 2, index: 0 })];
  await env.run('sortWindows(input)');
  assert.deepEqual(plain(env.calls.ungrouped), [[2, 3]]);
  assert.deepEqual(plain(env.calls.moved), [{ ids: [3, 2], options: { index: 1 } }]);
});

test('already sorted tabs cause no move calls', async () => {
  const env = setup();
  env.context.input = [tab(1), tab(2)];
  await env.run('sortWindows(input)');
  assert.equal(env.calls.moved.length, 0);
});

test('failed closes remain visible and report failure instead of success', async () => {
  const env = setup([tab(1), tab(2)], { remove: async id => {
    if (id === 2) throw new Error('Cannot edit tabs');
  } });
  await assert.rejects(env.run('closeTabs([1, 2])'), /could not be closed/);
  assert.match(env.controls.get('stats').textContent, /^1 tabs/);
  assert.deepEqual(plain(env.run('listedTabs.map(tab => tab.id)')), [2]);
});

test('already closed IDs do not turn a completed close into an error', async () => {
  const env = setup([], { remove: async () => { throw new Error('No tab'); } });
  await env.run('closeTabs([1])');
  assert.equal(env.run('listedTabs.length'), 0);
});

test('action lock prevents overlap and recovers after failure', async () => {
  const env = setup();
  let release;
  env.context.work = () => new Promise(resolve => { release = resolve; });
  const first = env.run('runAction(work)');
  env.context.second = () => { throw new Error('Must not run'); };
  await env.run('runAction(second)');
  assert.equal(env.controls.get('status').textContent, '');
  release();
  await first;
  await env.run('runAction(second)');
  assert.equal(env.run('busy'), false);
  assert.equal(env.controls.get('tidy-btn').disabled, false);
  assert.match(env.controls.get('status').textContent, /incomplete/);
});

test('tidy rechecks protected tabs after confirmation', async () => {
  const env = setup([tab(1), tab(2)]);
  env.run('renderTabList = async () => {}');
  env.context.window.confirm = () => { env.setTabs([tab(1), tab(2, { active: true })]); return true; };
  await env.run('tidyAllTabs()');
  assert.deepEqual(env.calls.removed, []);
  assert.match(env.controls.get('status').textContent, /Done/);
});

test('cancelling tidy makes no changes', async () => {
  const env = setup([tab(1), tab(2)]);
  env.context.window.confirm = () => false;
  await env.run('tidyAllTabs()');
  assert.deepEqual(env.calls.removed, []);
  assert.deepEqual(env.calls.moved, []);
  assert.deepEqual(env.calls.ungrouped, []);
});


test('hostile titles stay text and icons never use remote URLs', () => {
  const env = setup();
  env.context.document.createElement = tag => ({
    tag, dataset: {}, attributes: {}, children: [],
    set innerHTML(value) { throw new Error('Unsafe HTML sink'); },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener() {}, append(...children) { this.children.push(...children); },
  });
  const title = '\" autofocus onfocus=\"alert(1) <img src=https://example.org/track>';
  env.context.input = tab(1, { title, favIconUrl: 'https://example.org/track' });
  const item = env.run('createTabItem(input)');
  assert.equal(item.children[1].textContent, title);
  assert.equal(item.children[1].title, title);
  assert.equal(item.children[0].src, '../icons/icon-16.png');
  assert.equal(item.children.length, 4);
});
