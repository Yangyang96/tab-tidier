document.addEventListener('DOMContentLoaded', init);

async function init() {
  await renderTabList();
  document.getElementById('tidy-btn').addEventListener('click', tidyAllTabs);
}

async function getAllTabs() {
  return chrome.tabs.query({});
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'other';
  }
}

function groupTabsByDomain(tabs) {
  const groups = new Map();
  for (const tab of tabs) {
    const domain = getDomain(tab.url);
    if (!groups.has(domain)) {
      groups.set(domain, []);
    }
    groups.get(domain).push(tab);
  }
  // Sort by tab count descending
  return new Map([...groups.entries()].sort((a, b) => b[1].length - a[1].length));
}

function findDuplicates(tabs) {
  const urlMap = new Map();
  for (const tab of tabs) {
    if (!urlMap.has(tab.url)) {
      urlMap.set(tab.url, []);
    }
    urlMap.get(tab.url).push(tab);
  }

  const toClose = [];
  for (const [, group] of urlMap) {
    if (group.length <= 1) continue;

    const activeTab = group.find((t) => t.active);
    const keepTab = activeTab || group.reduce((oldest, t) => (t.id < oldest.id ? t : oldest));

    for (const tab of group) {
      if (tab.id !== keepTab.id && !tab.pinned) {
        toClose.push(tab.id);
      }
    }
  }
  return toClose;
}

function countDuplicates(tabs) {
  return findDuplicates(tabs).length;
}

async function renderTabList() {
  const tabs = await getAllTabs();
  const dupeCount = countDuplicates(tabs);
  const grouped = groupTabsByDomain(tabs);

  // Build duplicate URL set for badges
  const urlCounts = new Map();
  for (const tab of tabs) {
    urlCounts.set(tab.url, (urlCounts.get(tab.url) || 0) + 1);
  }

  document.getElementById('stats').textContent =
    `${tabs.length} tabs \u00b7 ${dupeCount} duplicate${dupeCount !== 1 ? 's' : ''}`;

  const listEl = document.getElementById('tab-list');
  listEl.innerHTML = '';

  for (const [domain, domainTabs] of grouped) {
    const groupEl = document.createElement('div');
    groupEl.className = 'domain-group';

    const headerEl = document.createElement('div');
    headerEl.className = 'domain-header';
    headerEl.innerHTML = `
      <span class="arrow">\u25BC</span>
      <span class="domain-name">${escapeHtml(domain)}</span>
      <span class="count">(${domainTabs.length})</span>
    `;

    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'domain-tabs';

    headerEl.addEventListener('click', () => {
      const arrow = headerEl.querySelector('.arrow');
      arrow.classList.toggle('collapsed');
      tabsContainer.classList.toggle('collapsed');
    });

    for (const tab of domainTabs) {
      const itemEl = document.createElement('div');
      itemEl.className = 'tab-item';

      const isDupe = urlCounts.get(tab.url) > 1;
      const favicon = tab.favIconUrl || `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;

      itemEl.innerHTML = `
        <img class="favicon" src="${escapeHtml(favicon)}" alt="">
        <span class="title" title="${escapeHtml(tab.title)}">${escapeHtml(tab.title)}</span>
        ${isDupe ? '<span class="duplicate-badge">dupe</span>' : ''}
      `;

      itemEl.addEventListener('click', () => {
        chrome.tabs.update(tab.id, { active: true });
        chrome.windows.update(tab.windowId, { focused: true });
        window.close();
      });

      tabsContainer.appendChild(itemEl);
    }

    groupEl.appendChild(headerEl);
    groupEl.appendChild(tabsContainer);
    listEl.appendChild(groupEl);
  }
}

async function tidyAllTabs() {
  const btn = document.getElementById('tidy-btn');
  btn.textContent = 'Tidying...';
  btn.disabled = true;

  try {
    // Step 1: Remove duplicates
    const tabs = await getAllTabs();
    const toClose = findDuplicates(tabs);
    if (toClose.length > 0) {
      await chrome.tabs.remove(toClose);
    }

    // Step 2: Group remaining tabs by domain
    const remaining = await getAllTabs();
    const grouped = groupTabsByDomain(remaining);

    // Assign domain colors in rotation
    const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey'];
    let colorIdx = 0;

    for (const [domain, domainTabs] of grouped) {
      if (domainTabs.length < 1) continue;

      const tabIds = domainTabs.map((t) => t.id);
      const groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, {
        title: domain,
        collapsed: domainTabs.length > 3,
        color: colors[colorIdx % colors.length],
      });
      colorIdx++;
    }

    // Success feedback
    btn.textContent = 'Done!';
    btn.classList.add('success');

    // Re-render the list
    await renderTabList();

    setTimeout(() => {
      btn.textContent = 'Tidy All Tabs';
      btn.classList.remove('success');
      btn.disabled = false;
    }, 1500);
  } catch (err) {
    btn.textContent = 'Error — try again';
    btn.disabled = false;
    console.error('Tab Tidier error:', err);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
