# DocPeer

AI-powered document peer review — write, review, debate, iterate.

## Quick Start

```bash
cd ~/doc-reviewer && ./start.sh
```

Opens at http://localhost:5180. Server on port 3500.

## How to Review a Document

1. Ensure the server is running (run `start.sh` or `npm run dev`)
2. The user opens the file in the browser UI at localhost:5180
3. To trigger an AI review, the user clicks Review in the UI, or Claude can edit the file directly and it live-reloads

## Architecture

- **Editor**: TipTap 2 + tiptap-markdown (Typora-style WYSIWYG markdown)
- **Comments**: Stored in `.reviews/<filename>.threads.json` (sidecar, never in the .md)
- **Server**: Express + WebSocket on port 3500
- **Client**: Vite on port 5180 (proxies to server)
- **AI**: Claude API via @anthropic-ai/sdk (needs ANTHROPIC_API_KEY env var)

## File Layout

```
src/client/main.ts       — UI logic, editor, popovers, WebSocket
src/client/comment-mark.ts — TipTap extension for yellow highlights
src/client/styles.css    — All styling
src/server/index.ts      — Express + WS server, file watcher
src/server/thread-store.ts — Thread CRUD, persists to .reviews/
src/server/reviewer.ts   — Claude API for review + auto-reply
```

## Key Behaviors

- Comment marks are visual only (stripped before saving to .md)
- File watcher auto-reloads editor when .md changes on disk
- Replying to an AI comment triggers automatic AI counter-response
- Comments are ordered by document position (top to bottom)
- Popovers open to the left/right of editor based on text position

## API Endpoints

- `GET /api/file?path=<path>` — read file content + threads
- `POST /api/file` — save file `{ path, content }`
- `GET /api/threads?path=<path>` — get all threads

## WebSocket Messages (ws://localhost:3500/ws)

- `new-comment` — `{ filePath, anchor: { text, contextBefore, contextAfter }, text }`
- `reply` — `{ filePath, threadId, text, author }`
- `resolve` — `{ filePath, threadId }`
- `review-start` — `{ filePath, persona }`
