let busy = false;
let listedTabs = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.getElementById('tidy-btn').addEventListener('click', tidyAllTabs);
  document.getElementById('search').addEventListener('input', filterTabs);
  await runAction(renderTabList);
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function button(className, text, title, onClick) {
  const el = element('button', className, text);
  el.type = 'button';
  el.title = title;
  el.setAttribute('aria-label', title);
  el.addEventListener('click', event => {
    event.stopPropagation();
    void runAction(onClick);
  });
  return el;
}

function setStatus(message) {
  document.getElementById('status').textContent = message;
}

async function runAction(action) {
  if (busy) return;
  busy = true;
  setStatus('');
  document.body.setAttribute('aria-busy', 'true');
  document.getElementById('tidy-btn').disabled = true;
  try {
    await action();
  } catch {
    setStatus('Operation incomplete. Reopen to refresh, then try again.');
  } finally {
    busy = false;
    document.body.setAttribute('aria-busy', 'false');
    document.getElementById('tidy-btn').disabled = false;
  }
}

function updateStats(tabs) {
  const duplicates = new Set(findDuplicates(tabs));
  document.getElementById('stats').textContent =
    `${tabs.length} tabs · ${duplicates.size} removable duplicates`;
  for (const item of document.querySelectorAll('.tab-item')) {
    item.querySelector('.duplicate-badge').hidden = !duplicates.has(Number(item.dataset.tabId));
  }
}

async function reconcileList() {
  listedTabs = await chrome.tabs.query({});
  const liveIds = new Set(listedTabs.map(tab => tab.id));
  for (const item of document.querySelectorAll('.tab-item')) {
    if (!liveIds.has(Number(item.dataset.tabId))) item.remove();
  }
  for (const group of document.querySelectorAll('.domain-group')) {
    const count = group.querySelectorAll('.tab-item').length;
    if (!count) group.remove();
    else group.querySelector('.count').textContent = `(${count})`;
  }
  updateStats(listedTabs);
  filterTabs();
}

async function closeTabs(ids) {
  // Per-tab results prevent one stale ID from hiding tabs that did not close.
  const results = await Promise.allSettled(ids.map(id => chrome.tabs.remove(id)));
  await reconcileList();
  const liveIds = new Set(listedTabs.map(tab => tab.id));
  if (results.some((result, index) => result.status === 'rejected' && liveIds.has(ids[index]))) {
    throw new Error('Some tabs could not be closed');
  }
}

async function closeDomain(tabsContainer, domain) {
  const shown = new Set([...tabsContainer.querySelectorAll('.tab-item')]
    .map(item => Number(item.dataset.tabId)));
  const current = await chrome.tabs.query({});
  const ids = current.filter(tab => shown.has(tab.id) && !tab.pinned &&
    getDomain(tab.url) === domain).map(tab => tab.id);
  if (!ids.length) return;
  if (!window.confirm(`Close ${ids.length} tabs from ${domain}? Pinned tabs stay open.`)) return;
  await closeTabs(ids);
}

function createTabItem(tab) {
  const item = element('div', 'tab-item');
  item.dataset.tabId = tab.id;
  // Only packaged assets: even favIconUrl may point to a remote tracking URL.
  const icon = element('img', 'favicon');
  icon.src = '../icons/icon-16.png';
  icon.alt = '';
  const title = button('title', tab.title || tab.url || 'Untitled tab',
    tab.title || 'Switch to tab', async () => {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      window.close();
    });
  const badge = element('span', 'duplicate-badge', 'dupe');
  badge.hidden = true;
  const close = button('close-btn', '×', tab.pinned ? 'Pinned tab' : 'Close tab', async () => {
    const current = await chrome.tabs.get(tab.id);
    if (!current.pinned) await closeTabs([tab.id]);
  });
  close.disabled = Boolean(tab.pinned);
  item.append(icon, title, badge, close);
  return item;
}

async function renderTabList() {
  listedTabs = await chrome.tabs.query({});
  const list = document.getElementById('tab-list');
  list.replaceChildren();
  for (const [domain, tabs] of groupTabsByDomain(listedTabs)) {
    const group = element('section', 'domain-group');
    const header = element('div', 'domain-header');
    const container = element('div', 'domain-tabs');
    const toggle = button('domain-toggle', '▾', `Toggle ${domain}`, () => {
      container.classList.toggle('collapsed');
      toggle.setAttribute('aria-expanded', String(!container.classList.contains('collapsed')));
      toggle.textContent = container.classList.contains('collapsed') ? '▸' : '▾';
    });
    toggle.setAttribute('aria-expanded', 'true');
    header.append(toggle, element('span', 'domain-name', domain),
      element('span', 'count', `(${tabs.length})`),
      button('domain-close-btn', '×', `Close unpinned ${domain} tabs`,
        () => closeDomain(container, domain)));
    for (const tab of tabs) container.append(createTabItem(tab));
    group.append(header, container);
    list.append(group);
  }
  updateStats(listedTabs);
  filterTabs();
}

function filterTabs() {
  const query = document.getElementById('search').value.trim().toLowerCase();
  const matches = new Set(listedTabs.filter(tab =>
    `${tab.title || ''} ${tab.url || ''}`.toLowerCase().includes(query)).map(tab => tab.id));
  for (const item of document.querySelectorAll('.tab-item')) {
    item.hidden = !matches.has(Number(item.dataset.tabId));
  }
  for (const group of document.querySelectorAll('.domain-group')) {
    group.hidden = ![...group.querySelectorAll('.tab-item')].some(item => !item.hidden);
  }
}

async function sortWindows(tabs) {
  const windows = new Map();
  for (const tab of tabs) {
    if (!windows.has(tab.windowId)) windows.set(tab.windowId, []);
    windows.get(tab.windowId).push(tab);
  }
  for (const windowTabs of windows.values()) {
    const groupedIds = windowTabs.filter(tab => tab.groupId !== -1 && tab.groupId !== undefined)
      .map(tab => tab.id);
    if (groupedIds.length) await chrome.tabs.ungroup(groupedIds);
    const unpinned = windowTabs.filter(tab => !tab.pinned);
    const sorted = [...unpinned].sort((a, b) =>
      getDomain(a.url).localeCompare(getDomain(b.url)) || a.index - b.index);
    if (sorted.some((tab, index) => tab.id !== unpinned[index].id)) {
      await chrome.tabs.move(sorted.map(tab => tab.id), {
        index: windowTabs.length - unpinned.length,
      });
    }
  }
}

async function tidyAllTabs() {
  await runAction(async () => {
    const planned = new Set(findDuplicates(await chrome.tabs.query({})));
    if (!window.confirm(`Close up to ${planned.size} duplicate tabs and sort all windows by domain? ` +
      'Active, pinned and audible tabs stay open. Existing tab groups will be removed.')) return;
    // Re-query after confirmation: never close newly protected/navigating tabs.
    const ids = findDuplicates(await chrome.tabs.query({})).filter(id => planned.has(id));
    await closeTabs(ids);
    await sortWindows(await chrome.tabs.query({}));
    await renderTabList();
    setStatus('Done. Tabs sorted within each window.');
  });
}
