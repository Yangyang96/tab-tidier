# Tab Tidier

A Chrome extension that helps you wrangle tab chaos — deduplicate, organize by domain, and close tabs in bulk.

## Features

- **Tab count badge** — live tab count on the extension icon
- **Tabs grouped by domain** — collapsible domain sections, sorted by tab count
- **Duplicate detection** — tabs with the same URL are flagged with a `dupe` badge
- **One-click tidy** — removes duplicates, ungroups tab groups, and sorts tabs by domain within each window
- **Close individual tabs** — click × on any tab to close it
- **Close all tabs in a domain** — hover a domain header and click × to close every tab under it
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
| `tabs`      | Query, close, move, and activate tabs    |
| `tabGroups` | Ungroup existing tab groups during tidy  |

## License

MIT
