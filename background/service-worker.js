async function updateBadge() {
  try {
    const tabs = await chrome.tabs.query({});
    await chrome.action.setBadgeText({ text: String(tabs.length) });
    await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  } catch {
    // Chrome may be shutting down; do not log browsing metadata.
  }
}

chrome.tabs.onCreated.addListener(updateBadge);
chrome.tabs.onRemoved.addListener(updateBadge);
chrome.tabs.onReplaced.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
