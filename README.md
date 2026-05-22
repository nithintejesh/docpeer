# DocPeer

AI-powered document peer review. Write, review, debate, iterate.

Write a doc → AI reviews it with inline comments → you reply → AI responds → you iterate on the doc → repeat until it's sharp.

## Quick Start

```bash
cd ~/doc-reviewer
./start.sh
```

Open http://localhost:5180, click Open, enter a .md file path.

## Usage

- **Select text + click 💬** — add a comment
- **Click highlighted text** — view thread, reply, resolve
- **↑↓ arrows in popover** — navigate between comments
- **Review button** — trigger full AI review (needs ANTHROPIC_API_KEY)
- **Edit .md externally** — browser live-reloads

## The Loop

```
Write → Review → Debate → Learn → Iterate → Repeat
```

You write. AI challenges your thinking. You defend or improve. The doc gets sharper with every pass.

## Tech Stack

- TipTap 2 (ProseMirror) — WYSIWYG markdown editor
- Express + WebSocket — real-time thread sync
- Claude API — AI review and auto-debate
- Chokidar — file watching for live reload
- Vite — client bundling

## TODO

- [ ] **MCP Server** — expose DocPeer as MCP tools so Claude can programmatically start the server, open files, trigger reviews, add comments, and resolve threads. Tools: `docpeer_start`, `docpeer_open`, `docpeer_review`, `docpeer_comment`, `docpeer_threads`, `docpeer_resolve`
- [ ] **Auto-open in browser** — when Claude opens a file via MCP, auto-navigate the browser tab
- [ ] **Multiple file support** — review multiple docs in tabs
- [ ] **Review personas** — security reviewer, technical depth, devil's advocate, clarity check
- [ ] **Diff view** — show what changed between review rounds
- [ ] **Export** — generate a summary of all resolved/open comments
- [ ] **Team mode** — multiple human reviewers + AI
