function getDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname || parsed.protocol.replace(':', '');
  } catch {
    return 'other';
  }
}

function isProtected(tab) {
  return tab.pinned || tab.active || tab.audible || Boolean(tab.pendingUrl);
}

function duplicateKey(tab) {
  try {
    if (!['http:', 'https:'].includes(new URL(tab.url).protocol)) return null;
    if (tab.pendingUrl) return null;
    return `${Boolean(tab.incognito)}:${tab.url}`;
  } catch {
    return null;
  }
}

function findDuplicates(tabs) {
  const groups = new Map();
  for (const tab of tabs) {
    const key = duplicateKey(tab);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tab);
  }
  const toClose = [];
  for (const group of groups.values()) {
    const keep = group.find(isProtected) ||
      group.reduce((oldest, tab) => tab.id < oldest.id ? tab : oldest);
    toClose.push(...group.filter(tab => tab.id !== keep.id && !isProtected(tab))
      .map(tab => tab.id));
  }
  return toClose;
}

function groupTabsByDomain(tabs) {
  const groups = new Map();
  for (const tab of tabs) {
    const domain = getDomain(tab.url);
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push(tab);
  }
  return new Map([...groups].sort((a, b) => b[1].length - a[1].length));
}
