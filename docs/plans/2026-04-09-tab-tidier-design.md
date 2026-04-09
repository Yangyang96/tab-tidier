# Tab Tidier — Chrome Extension Design

**Date:** 2026-04-09
**Status:** Validated

## Problem

Too many browser tabs accumulate over time — duplicates pile up and tabs become hard to find or organize.

## Solution

A lightweight Chrome extension that provides one-click tab cleanup: deduplicate and organize all tabs by domain.

## Core Features

### 1. Tidy All Tabs (One Button)
- Finds all duplicate tabs (exact URL match) and closes extras
- Groups remaining tabs by domain using Chrome Tab Groups API
- Single button triggers both operations

### 2. Duplicate Strategy
- Keep the **active tab** if one of the duplicates is currently active
- Fallback to keeping the **oldest tab** if none is active
- **Pinned tabs are never closed**, even if they are duplicates

### 3. Grouped Tab View
- Popup panel shows all tabs grouped by domain
- Domain headers display name and tab count (e.g., "github.com (7)")
- Click any tab to switch to it instantly

### 4. Tab Count Badge
- Extension icon always shows total open tab count
- Updates in real-time as tabs open/close

## UI Layout

```
┌─────────────────────────────┐
│  Tidy All Tabs               │  ← Main action button
│  "12 tabs · 3 duplicates"   │  ← Quick stats line
├─────────────────────────────┤
│  ▼ github.com (7)           │  ← Domain group header
│    PR #1234 - fix auth      │
│    Issues · my-repo         │
│    ...                      │
│  ▼ notes.example.org (4)     │
│    策略插件使用指南           │
│    ...                      │
│  ▼ google.com (1)           │
│    search results           │
└─────────────────────────────┘
```

## Technical Architecture

### Manifest V3

```
tab-tidier/
├── manifest.json          ← Extension config, permissions
├── popup/
│   ├── popup.html         ← Popup panel markup
│   ├── popup.css          ← Styling
│   └── popup.js           ← UI logic, tab listing
├── background/
│   └── service-worker.js  ← Badge update, tab event listeners
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

### Chrome APIs

| API | Purpose |
|-----|---------|
| `chrome.tabs.query()` | Get all open tabs |
| `chrome.tabs.remove()` | Close duplicate tabs |
| `chrome.tabs.update()` | Switch to a tab on click |
| `chrome.tabs.group()` | Group tabs by domain |
| `chrome.tabGroups.update()` | Set group title & color |
| `chrome.action.setBadgeText()` | Show tab count on icon |

### Constraints

- **No backend, no storage, no external dependencies**
- Pure vanilla JS — no framework, no build step
- All operations use tab metadata only — no tab reactivation
- Inactive tabs remain inactive throughout all operations

## Core Logic Flow

```
1. Query all tabs → chrome.tabs.query({})
2. Build Map: URL → [tab1, tab2, ...]
3. For each URL with multiple tabs:
   - Keep: active tab, or oldest tab as fallback
   - Close: the rest via chrome.tabs.remove()
4. Re-query remaining tabs
5. Build Map: domain → [tab1, tab2, ...]
6. For each domain group:
   - chrome.tabs.group() to create group
   - chrome.tabGroups.update() to set domain as title
7. Update badge count
```

## Edge Cases

| Case | Behavior |
|------|----------|
| URL with hash/query differences | Treat as different tabs. Only exact URL match = duplicate |
| Pinned tabs | Never close, even if duplicates |
| Tabs in other windows | Include all windows in dedup and grouping |
| Only 1 tab open | No-op gracefully, show "0 duplicates" |
| Already grouped tabs | Re-group by domain, override existing groups |

## Out of Scope

- No search functionality (use Chrome's built-in Ctrl+Shift+A)
- No auto-closing or scheduling
- No tab preview
- No cross-browser support
