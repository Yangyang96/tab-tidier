# Tab Tidier

A Chrome extension that helps you wrangle tab chaos — deduplicate, organize by domain, and close tabs in bulk.

## Features

- **Tab count badge** — live tab count on the extension icon
- **Tabs grouped by domain** — collapsible domain sections, sorted by tab count
- **Duplicate detection** — removable copies of identical HTTP(S) URLs are flagged with a `dupe` badge; active, pinned, audible and navigating tabs are protected
- **One-click tidy** — removes duplicates, ungroups tab groups, and sorts tabs by domain within each window
- **Close individual tabs** — click × on an unpinned tab to close it
- **Close all tabs in a domain** — click × and confirm to close unpinned tabs in that domain (including tabs hidden by search)
- **Search tabs** — filter titles and URLs locally without sending browsing data anywhere
- **Safer cleanup** — confirm bulk operations; reconcile the list with Chrome after partial failures
- **Stable list order** — the list doesn't re-sort while you're deleting tabs; order stays frozen until you reopen the popup

## Install

1. Clone this repo:
   ```bash
   git clone https://github.com/Yangyang96/tab-tidier.git
   ```
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the `tab-tidier` folder

## Project Structure

```
tab-tidier/
├── manifest.json            # Chrome extension manifest (v3)
├── background/
│   └── service-worker.js    # Badge updater — shows live tab count
├── popup/
│   ├── popup.html           # Popup UI entry point
│   ├── popup.js             # Tab querying, grouping, and tidy logic
│   └── popup.css            # Popup styles
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

## Permissions

| Permission  | Why                                      |
|-------------|------------------------------------------|
| `tabs`      | Read tab URLs/titles for domain grouping, search and exact duplicate detection |

## License

MIT

## Privacy and safety

Version 1.1.0 uses packaged icons only. No remote favicon requests, analytics,
backend, content scripts, external dependencies or persistent browsing storage.
The extension page CSP blocks network connections and remote images/scripts.
The `tabs` permission exposes sensitive tab metadata (URLs and titles) to the
extension; all processing happens locally. It does not request cookies,
webpage content, history, host access or incognito access.

Tidy works across accessible windows, keeping each window separate when sorting.
It removes existing tab groups. Deduplication uses exact HTTP(S) URLs (including
queries and fragments), keeps protected copies or the lowest-ID copy otherwise,
and never merges regular and incognito contexts. Other schemes and tabs with a
pending navigation are excluded from automatic deduplication. Closing a tab can
lose unsaved page state even when another copy has the same URL. Bulk actions
show a confirmation; this extension does not store an undo snapshot. Chrome's
Reopen Closed Tab may recover a page but cannot guarantee its unsaved state.

A review of the nine original commits found no credential patterns in the 17
unique text blobs. The published branch history has been sanitized to use a GitHub noreply
address and example domains. Older clones, forks and cached commit URLs may
retain pre-cleanup objects; rewriting a branch cannot erase those copies.
Pattern checks and code review cannot guarantee the absence of every secret.

## Verification

No build or dependency installation is required. With Node.js installed:

```bash
node --test tests/*.test.cjs
```

Tests cover protected tabs, exact URLs, navigation, incognito separation,
per-window sorting, partial close failures and overlapping actions. For Chrome
acceptance, use disposable tabs in a separate window; verify cancel first,
then deduplication, pinned-tab protection, search and badge updates. Do not
run bulk cleanup on valuable tabs as a test.
