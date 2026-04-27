# CLAUDE.md

## Project Overview

Tab Tidier is a Chrome extension (Manifest V3) that helps users manage browser tab clutter. It deduplicates tabs, organizes them by domain, and provides bulk close operations.

## Tech Stack

- **Platform**: Chrome Extension (Manifest V3)
- **Language**: Vanilla JavaScript (no frameworks, no build step)
- **APIs**: `chrome.tabs`, `chrome.tabGroups`, `chrome.action`

## Architecture

- `manifest.json` — extension config, permissions, entry points
- `background/service-worker.js` — badge updater (live tab count on icon)
- `popup/popup.js` — all tab logic: querying, grouping, dedup, tidy, DOM updates
- `popup/popup.html` + `popup.css` — popup UI

No build tools, no bundler — edit files directly and reload the extension.

## Key Design Decisions

- **DOM-in-place updates on delete**: When tabs are closed, the list updates in place (remove element, update count). No re-sort or re-render until the popup is reopened. This prevents the list from jumping around while the user is deleting tabs.
- **Domain grouping**: Tabs are grouped by hostname and sorted by count (descending) on initial render only.
- **Duplicate detection**: Tabs sharing the same URL are flagged. On tidy, duplicates are closed (keeping the active or oldest tab).
- **Immutable patterns**: Prefer creating new data structures over mutating existing ones.

## Development Workflow

1. Edit files in `popup/` or `background/`
2. Go to `chrome://extensions/` → click reload on Tab Tidier
3. Click the extension icon to test

## Coding Conventions

- Vanilla JS, no dependencies, no transpilation
- Functions should be small (<50 lines) and well-named
- Use `async/await` for Chrome API calls
- Always escape user-facing strings with `escapeHtml()`
- Handle errors from `chrome.tabs.remove()` gracefully (tabs may already be closed)

## Testing

No automated test setup yet. Test manually by:
- Opening many tabs across multiple domains
- Verifying duplicate badges appear correctly
- Testing close (single tab, whole domain, tidy all)
- Checking badge count updates after operations
