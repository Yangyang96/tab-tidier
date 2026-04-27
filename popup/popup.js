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

async function updateStats() {
  const tabs = await getAllTabs();
  const dupeCount = countDuplicates(tabs);
  document.getElementById('stats').textContent =
    `${tabs.length} tabs \u00b7 ${dupeCount} duplicate${dupeCount !== 1 ? 's' : ''}`;
}

function removeTabFromDom(tabItemEl) {
  const tabsContainer = tabItemEl.parentElement;
  const groupEl = tabsContainer.parentElement;
  tabItemEl.remove();

  if (tabsContainer.children.length === 0) {
    groupEl.remove();
  } else {
    const countEl = groupEl.querySelector('.domain-header .count');
    countEl.textContent = `(${tabsContainer.children.length})`;
  }
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
      <span class="domain-close-btn" title="Close all ${escapeHtml(domain)} tabs">\u00d7</span>
    `;

    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'domain-tabs';

    headerEl.addEventListener('click', (e) => {
      if (e.target.closest('.domain-close-btn')) return;
      const arrow = headerEl.querySelector('.arrow');
      arrow.classList.toggle('collapsed');
      tabsContainer.classList.toggle('collapsed');
    });

    headerEl.querySelector('.domain-close-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const remainingItems = tabsContainer.querySelectorAll('.tab-item');
      const tabIds = [...remainingItems].map((el) => Number(el.dataset.tabId));
      try {
        await chrome.tabs.remove(tabIds);
      } catch (err) {
        console.error('Error closing domain tabs:', err);
      }
      groupEl.remove();
      await updateStats();
    });

    for (const tab of domainTabs) {
      const itemEl = document.createElement('div');
      itemEl.className = 'tab-item';
      itemEl.dataset.tabId = tab.id;

      const isDupe = urlCounts.get(tab.url) > 1;
      const favicon = tab.favIconUrl || `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;

      itemEl.innerHTML = `
        <img class="favicon" src="${escapeHtml(favicon)}" alt="">
        <span class="title" title="${escapeHtml(tab.title)}">${escapeHtml(tab.title)}</span>
        ${isDupe ? '<span class="duplicate-badge">dupe</span>' : ''}
        <span class="close-btn" title="Close tab">\u00d7</span>
      `;

      itemEl.querySelector('.title').addEventListener('click', () => {
        chrome.tabs.update(tab.id, { active: true });
        chrome.windows.update(tab.windowId, { focused: true });
        window.close();
      });

      itemEl.querySelector('.close-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        await chrome.tabs.remove(tab.id);
        removeTabFromDom(itemEl);
        await updateStats();
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

    // Step 2: Ungroup all existing tab groups
    const allGroups = await chrome.tabGroups.query({});
    for (const group of allGroups) {
      const groupedTabs = await chrome.tabs.query({ groupId: group.id });
      for (const tab of groupedTabs) {
        await chrome.tabs.ungroup(tab.id);
      }
    }

    // Step 3: Sort tabs by domain within each window (no cross-window moves)
    const remaining = await getAllTabs();

    // Group by window first, then sort by domain within each window
    const byWindow = new Map();
    for (const tab of remaining) {
      if (!byWindow.has(tab.windowId)) {
        byWindow.set(tab.windowId, []);
      }
      byWindow.get(tab.windowId).push(tab);
    }

    for (const [, windowTabs] of byWindow) {
      // Sort: pinned tabs stay in place, others sorted by domain
      const pinned = windowTabs.filter((t) => t.pinned);
      const unpinned = windowTabs.filter((t) => !t.pinned);

      unpinned.sort((a, b) => getDomain(a.url).localeCompare(getDomain(b.url)));

      const startIndex = pinned.length;
      for (let i = 0; i < unpinned.length; i++) {
        await chrome.tabs.move(unpinned[i].id, { index: startIndex + i });
      }
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
