function updateBadge() {
  chrome.tabs.query({}, (tabs) => {
    const count = tabs.length.toString();
    chrome.action.setBadgeText({ text: count });
    chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  });
}

chrome.tabs.onCreated.addListener(updateBadge);
chrome.tabs.onRemoved.addListener(updateBadge);
chrome.tabs.onReplaced.addListener(updateBadge);

chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
