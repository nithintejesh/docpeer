import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { watchFile } from "./file-watcher.js";
import { ThreadStore } from "./thread-store.js";
import { reviewDocument } from "./reviewer.js";
import type { ReviewRequest } from "../shared/types.js";

const app = express();
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const clients = new Set<WebSocket>();
const threadStore = new ThreadStore();

function broadcast(type: string, payload: unknown) {
  const msg = JSON.stringify({ type, payload });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));

  ws.on("message", async (raw) => {
    const msg = JSON.parse(raw.toString());

    switch (msg.type) {
      case "new-comment": {
        const { filePath, anchor, text } = msg.payload;
        const thread = threadStore.addThread(filePath, anchor, text, "human");
        broadcast("threads-update", {
          filePath,
          threads: threadStore.getThreads(filePath),
        });
        break;
      }

      case "reply": {
        const { filePath, threadId, text, author } = msg.payload;
        threadStore.addReply(filePath, threadId, text, author || "human");
        broadcast("threads-update", {
          filePath,
          threads: threadStore.getThreads(filePath),
        });

        if (author === "human") {
          triggerAiReply(filePath, threadId);
        }
        break;
      }

      case "resolve": {
        const { filePath, threadId } = msg.payload;
        threadStore.resolveThread(filePath, threadId);
        broadcast("threads-update", {
          filePath,
          threads: threadStore.getThreads(filePath),
        });
        break;
      }

      case "review-start": {
        const req = msg.payload as ReviewRequest;
        broadcast("review-progress", { status: "starting" });

        try {
          await reviewDocument(req, (comment) => {
            threadStore.addThread(
              req.filePath,
              comment.anchor,
              comment.text,
              "ai"
            );
            broadcast("threads-update", {
              filePath: req.filePath,
              threads: threadStore.getThreads(req.filePath),
            });
          });
          broadcast("review-done", { filePath: req.filePath });
        } catch (err: any) {
          broadcast("review-done", {
            filePath: req.filePath,
            error: err.message,
          });
        }
        break;
      }
    }
  });

  const filePath = threadStore.getActiveFile();
  if (filePath) {
    ws.send(
      JSON.stringify({
        type: "threads-update",
        payload: { filePath, threads: threadStore.getThreads(filePath) },
      })
    );
  }
});

async function triggerAiReply(filePath: string, threadId: string) {
  const thread = threadStore
    .getThreads(filePath)
    .find((t) => t.id === threadId);
  if (!thread) return;

  try {
    const { replyToThread } = await import("./reviewer.js");
    const reply = await replyToThread(filePath, thread);
    if (reply) {
      threadStore.addReply(filePath, threadId, reply, "ai");
      broadcast("threads-update", {
        filePath,
        threads: threadStore.getThreads(filePath),
      });
    }
  } catch (err) {
    console.error("AI reply failed:", err);
  }
}

// File watching for live reload
let activeWatcher: ReturnType<typeof watchFile> | null = null;

function startWatching(filePath: string) {
  if (activeWatcher) activeWatcher.close();
  activeWatcher = watchFile(filePath, (content) => {
    broadcast("file-changed", { filePath, content });
  });
}

// REST API for file operations
app.get("/api/file", async (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: "path required" });

  try {
    const { readFileSync } = await import("fs");
    const content = readFileSync(filePath, "utf-8");
    threadStore.setActiveFile(filePath);
    startWatching(filePath);
    res.json({ content, threads: threadStore.getThreads(filePath) });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

app.post("/api/file", async (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined)
    return res.status(400).json({ error: "path and content required" });

  try {
    const { writeFileSync } = await import("fs");
    writeFileSync(filePath, content, "utf-8");
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/threads", (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: "path required" });
  res.json(threadStore.getThreads(filePath));
});

const PORT = 3500;
server.listen(PORT, () => {
  console.log(`[docpeer] Server running on http://localhost:${PORT}`);
  console.log(`[docpeer] WebSocket on ws://localhost:${PORT}/ws`);
});
