import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join, basename } from "path";
import { v4 as uuid } from "uuid";
import type { CommentThread, TextAnchor, ThreadMessage } from "../shared/types.js";

export class ThreadStore {
  private activeFile: string | null = null;
  private cache = new Map<string, CommentThread[]>();

  setActiveFile(filePath: string) {
    this.activeFile = filePath;
    if (!this.cache.has(filePath)) {
      this.cache.set(filePath, this.loadFromDisk(filePath));
    }
  }

  getActiveFile(): string | null {
    return this.activeFile;
  }

  getThreads(filePath: string): CommentThread[] {
    if (!this.cache.has(filePath)) {
      this.cache.set(filePath, this.loadFromDisk(filePath));
    }
    return this.cache.get(filePath)!;
  }

  addThread(
    filePath: string,
    anchor: TextAnchor,
    text: string,
    author: "human" | "ai"
  ): CommentThread {
    const threads = this.getThreads(filePath);
    const thread: CommentThread = {
      id: uuid(),
      anchor,
      status: "open",
      unread: author === "ai",
      messages: [
        {
          id: uuid(),
          author,
          text,
          timestamp: Date.now(),
        },
      ],
      createdAt: Date.now(),
    };
    threads.push(thread);
    this.saveToDisk(filePath);
    return thread;
  }

  addReply(
    filePath: string,
    threadId: string,
    text: string,
    author: "human" | "ai"
  ) {
    const threads = this.getThreads(filePath);
    const thread = threads.find((t) => t.id === threadId);
    if (!thread) return;

    const msg: ThreadMessage = {
      id: uuid(),
      author,
      text,
      timestamp: Date.now(),
    };
    thread.messages.push(msg);
    if (author === "ai") thread.unread = true;
    this.saveToDisk(filePath);
  }

  resolveThread(filePath: string, threadId: string) {
    const threads = this.getThreads(filePath);
    const thread = threads.find((t) => t.id === threadId);
    if (thread) {
      thread.status = "resolved";
      this.saveToDisk(filePath);
    }
  }

  private getReviewDir(filePath: string): string {
    return join(dirname(filePath), ".reviews");
  }

  private getReviewPath(filePath: string): string {
    const name = basename(filePath, ".md");
    return join(this.getReviewDir(filePath), `${name}.threads.json`);
  }

  private loadFromDisk(filePath: string): CommentThread[] {
    const reviewPath = this.getReviewPath(filePath);
    if (!existsSync(reviewPath)) return [];
    try {
      const raw = readFileSync(reviewPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private saveToDisk(filePath: string) {
    const dir = this.getReviewDir(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const reviewPath = this.getReviewPath(filePath);
    const threads = this.cache.get(filePath) || [];
    writeFileSync(reviewPath, JSON.stringify(threads, null, 2), "utf-8");
  }
}
