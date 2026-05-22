import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { CommentMark } from "./comment-mark";
import type { CommentThread } from "../shared/types";

let editor: Editor;
let ws: WebSocket;
let currentFilePath: string | null = null;
let threads: CommentThread[] = [];
let activeThreadId: string | null = null;
let pendingSelection: { from: number; to: number; text: string } | null = null;
let applyingMarks = false;

function initEditor() {
  editor = new Editor({
    element: document.getElementById("editor")!,
    extensions: [
      StarterKit,
      Markdown,
      CommentMark.configure({
        onCommentActivated: (commentId) => {
          if (applyingMarks) return;
          if (commentId && commentId !== activeThreadId) {
            activeThreadId = commentId;
            highlightActiveThread();
            showThreadPopover(commentId);
          }
        },
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "tiptap",
      },
    },
    onUpdate: () => {
      if (currentFilePath && !applyingMarks) {
        let md = editor.storage.markdown.getMarkdown();
        md = md.replace(/<span data-comment-id="[^"]*" class="comment-mark">/g, "");
        md = md.replace(/<\/span>/g, "");
        saveFile(currentFilePath, md);
      }
    },
    onSelectionUpdate: ({ editor }) => {
      if (applyingMarks) return;
      const { from, to } = editor.state.selection;
      if (to - from > 3) {
        const text = editor.state.doc.textBetween(from, to);
        pendingSelection = { from, to, text };
        showSelectionTooltip(to);
      } else {
        pendingSelection = null;
        hideSelectionTooltip();
      }
    },
  });

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "m") {
      e.preventDefault();
      if (pendingSelection) showCommentPopover();
    }
  });

  // Click outside to close popovers
  document.addEventListener("mousedown", (e) => {
    const threadPopover = document.getElementById("thread-popover")!;
    const commentPopover = document.getElementById("comment-popover")!;
    const tooltip = document.getElementById("selection-tooltip");

    if (
      !threadPopover.classList.contains("hidden") &&
      !threadPopover.contains(e.target as Node) &&
      !(e.target as HTMLElement).closest(".comment-mark")
    ) {
      threadPopover.classList.add("hidden");
      activeThreadId = null;
      highlightActiveThread();
    }

    if (
      !commentPopover.classList.contains("hidden") &&
      !commentPopover.contains(e.target as Node) &&
      !(tooltip && tooltip.contains(e.target as Node))
    ) {
      commentPopover.classList.add("hidden");
    }
  });
}

function initWebSocket() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
      case "threads-update":
        if (msg.payload.filePath === currentFilePath) {
          threads = msg.payload.threads;
          applyCommentMarks();
          updateThreadCount();
          if (activeThreadId) showThreadPopover(activeThreadId);
        }
        break;
      case "file-changed":
        if (msg.payload.filePath === currentFilePath) {
          editor.commands.setContent(msg.payload.content);
          applyCommentMarks();
        }
        break;
      case "review-progress":
        document.getElementById("review-status")!.textContent = "Reviewing...";
        break;
      case "review-done":
        document.getElementById("review-status")!.textContent = msg.payload
          .error
          ? `Error: ${msg.payload.error}`
          : "Done!";
        setTimeout(() => {
          document.getElementById("review-status")!.textContent = "";
        }, 3000);
        break;
    }
  };

  ws.onclose = () => {
    setTimeout(initWebSocket, 2000);
  };
}

async function openFile(filePath: string) {
  const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
  if (!res.ok) {
    alert("Failed to open file");
    return;
  }
  const data = await res.json();
  currentFilePath = filePath;
  threads = data.threads || [];

  editor.commands.setContent(data.content);
  document.getElementById("file-name")!.textContent =
    filePath.split("/").pop() || filePath;
  document.getElementById("btn-review")!.removeAttribute("disabled");

  applyCommentMarks();
  updateThreadCount();
}

async function saveFile(filePath: string, content: string) {
  await fetch("/api/file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: filePath, content }),
  });
}

function applyCommentMarks() {
  applyingMarks = true;
  const openThreads = threads.filter((t) => t.status === "open");
  const docText = editor.state.doc.textContent;

  for (const thread of openThreads) {
    const idx = docText.indexOf(thread.anchor.text);
    if (idx === -1) continue;

    const from = idx + 1;
    const to = from + thread.anchor.text.length;

    try {
      editor.commands.setTextSelection({ from, to });
      editor.commands.setCommentMark(thread.id);
    } catch {}
  }

  editor.commands.setTextSelection(0);
  applyingMarks = false;
}

function updateThreadCount() {
  const openThreads = threads.filter((t) => t.status === "open");
  document.getElementById("thread-count")!.textContent =
    openThreads.length > 0 ? `${openThreads.length} comments` : "";
}

function showThreadPopover(threadId: string) {
  const thread = threads.find((t) => t.id === threadId && t.status === "open");
  if (!thread) return;

  const popover = document.getElementById("thread-popover")!;
  const orderedThreads = getOrderedThreads();
  const currentIdx = orderedThreads.findIndex((t) => t.id === threadId);
  const total = orderedThreads.length;

  // Position based on where the text is on screen
  const markEl = document.querySelector(
    `.comment-mark[data-comment-id="${threadId}"]`
  ) as HTMLElement;

  if (markEl) {
    const rect = markEl.getBoundingClientRect();
    const editorEl = document.getElementById("editor")!;
    const editorRect = editorEl.getBoundingClientRect();
    const editorCenter = editorRect.left + editorRect.width / 2;

    let left: number;
    if (rect.left < editorCenter) {
      // Highlighted text is on the left — popover to the left
      left = editorRect.left - 320 - 16;
    } else {
      // Highlighted text is on the right — popover to the right
      left = editorRect.right + 16;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - 328));

    let top = rect.top;
    if (top + 380 > window.innerHeight) {
      top = window.innerHeight - 390;
    }
    top = Math.max(8, top);

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }

  popover.innerHTML = `
    <div class="thread-popover-header">
      <div class="thread-popover-nav">
        <button class="thread-nav-btn" id="thread-nav-prev" title="Previous comment">&#8593;</button>
        <span class="thread-nav-count">${currentIdx + 1} / ${total}</span>
        <button class="thread-nav-btn" id="thread-nav-next" title="Next comment">&#8595;</button>
      </div>
      <button class="thread-popover-close" id="thread-popover-close">&times;</button>
    </div>
    <div class="thread-popover-messages">
      ${thread.messages
        .map(
          (msg) => `
        <div class="thread-message ${msg.author}">
          <div class="message-header">
            <span class="message-author ${msg.author}">${msg.author === "ai" ? "AI" : "You"}</span>
            <span class="message-time">${formatTime(msg.timestamp)}</span>
          </div>
          <div class="message-text">${escapeHtml(msg.text)}</div>
        </div>
      `
        )
        .join("")}
    </div>
    <div class="thread-popover-reply">
      <input type="text" placeholder="Reply..." id="thread-popover-input" />
    </div>
    <div class="thread-popover-actions">
      <button id="thread-popover-resolve">Resolve</button>
    </div>
  `;

  popover.classList.remove("hidden");

  // Wire up events
  document.getElementById("thread-popover-close")!.addEventListener("click", () => {
    popover.classList.add("hidden");
    activeThreadId = null;
    highlightActiveThread();
  });

  document.getElementById("thread-nav-prev")!.addEventListener("click", () => {
    navigateComment("prev");
  });

  document.getElementById("thread-nav-next")!.addEventListener("click", () => {
    navigateComment("next");
  });

  const input = document.getElementById("thread-popover-input") as HTMLInputElement;
  input.focus();
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      ws.send(
        JSON.stringify({
          type: "reply",
          payload: {
            filePath: currentFilePath,
            threadId,
            text: input.value.trim(),
            author: "human",
          },
        })
      );
      input.value = "";
    }
  });

  document.getElementById("thread-popover-resolve")!.addEventListener("click", () => {
    ws.send(
      JSON.stringify({
        type: "resolve",
        payload: { filePath: currentFilePath, threadId },
      })
    );
    popover.classList.add("hidden");
    activeThreadId = null;
    highlightActiveThread();
  });
}

function getOrderedThreads(): CommentThread[] {
  const openThreads = threads.filter((t) => t.status === "open");
  const docText = editor.state.doc.textContent;
  return openThreads.sort((a, b) => {
    const idxA = docText.indexOf(a.anchor.text);
    const idxB = docText.indexOf(b.anchor.text);
    return idxA - idxB;
  });
}

function navigateComment(direction: "prev" | "next") {
  const openThreads = getOrderedThreads();
  if (openThreads.length === 0) return;

  const currentIdx = activeThreadId
    ? openThreads.findIndex((t) => t.id === activeThreadId)
    : -1;

  let nextIdx: number;
  if (direction === "next") {
    nextIdx = currentIdx < openThreads.length - 1 ? currentIdx + 1 : 0;
  } else {
    nextIdx = currentIdx > 0 ? currentIdx - 1 : openThreads.length - 1;
  }

  const thread = openThreads[nextIdx];
  activeThreadId = thread.id;
  highlightActiveThread();
  showThreadPopover(thread.id);

  const markEl = document.querySelector(
    `.comment-mark[data-comment-id="${thread.id}"]`
  ) as HTMLElement;
  if (markEl) {
    markEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function showSelectionTooltip(pos: number) {
  let tooltip = document.getElementById("selection-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "selection-tooltip";
    tooltip.innerHTML = `<button id="btn-tooltip-comment" title="Add comment">💬</button>`;
    document.body.appendChild(tooltip);
    tooltip.querySelector("#btn-tooltip-comment")!.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideSelectionTooltip();
      showCommentPopover();
    });
  }
  const coords = editor.view.coordsAtPos(pos);
  tooltip.style.top = `${coords.top - 40}px`;
  tooltip.style.left = `${coords.left}px`;
  tooltip.classList.remove("hidden");
}

function hideSelectionTooltip() {
  const tooltip = document.getElementById("selection-tooltip");
  if (tooltip) tooltip.classList.add("hidden");
}

function showCommentPopover() {
  if (!pendingSelection) return;

  const popover = document.getElementById("comment-popover")!;
  const input = document.getElementById("comment-input") as HTMLTextAreaElement;

  const coordsFrom = editor.view.coordsAtPos(pendingSelection.from);
  const editorEl = document.getElementById("editor")!;
  const editorRect = editorEl.getBoundingClientRect();
  const editorCenter = editorRect.left + editorRect.width / 2;

  let left: number;
  if (coordsFrom.left < editorCenter) {
    // Selected text is on the left — popover to the left
    left = editorRect.left - 300 - 16;
  } else {
    // Selected text is on the right — popover to the right
    left = editorRect.right + 16;
  }
  left = Math.max(8, Math.min(left, window.innerWidth - 308));

  popover.style.top = `${coordsFrom.top}px`;
  popover.style.left = `${left}px`;
  popover.classList.remove("hidden");
  input.value = "";
  input.focus();

  input.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitComment();
    }
  };
}

function hideCommentPopover() {
  document.getElementById("comment-popover")!.classList.add("hidden");
}

function submitComment() {
  if (!pendingSelection || !currentFilePath) return;

  const input = document.getElementById("comment-input") as HTMLTextAreaElement;
  const text = input.value.trim();
  if (!text) return;

  const docText = editor.state.doc.textContent;
  const anchorText = pendingSelection.text;
  const anchorIdx = docText.indexOf(anchorText);

  const anchor = {
    text: anchorText,
    contextBefore: anchorIdx > 0 ? docText.substring(Math.max(0, anchorIdx - 30), anchorIdx) : "",
    contextAfter: docText.substring(anchorIdx + anchorText.length, anchorIdx + anchorText.length + 30),
  };

  ws.send(
    JSON.stringify({
      type: "new-comment",
      payload: { filePath: currentFilePath, anchor, text },
    })
  );

  hideCommentPopover();
  pendingSelection = null;
}

function highlightActiveThread() {
  document.querySelectorAll(".comment-mark").forEach((el) => {
    el.classList.toggle(
      "active",
      el.getAttribute("data-comment-id") === activeThreadId
    );
  });
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


// Init
document.addEventListener("DOMContentLoaded", () => {
  initEditor();
  initWebSocket();

  document.getElementById("btn-open")!.addEventListener("click", () => {
    const filePath = prompt("Enter file path:", "/Users/csnithin/doc-reviewer/sample.md");
    if (filePath) openFile(filePath);
  });

  document.getElementById("btn-review")!.addEventListener("click", () => {
    if (!currentFilePath) return;
    const persona = (document.getElementById("persona-select") as HTMLSelectElement).value;
    ws.send(
      JSON.stringify({
        type: "review-start",
        payload: { filePath: currentFilePath, persona },
      })
    );
  });

  document.getElementById("btn-cancel-comment")!.addEventListener("click", hideCommentPopover);
  document.getElementById("btn-submit-comment")!.addEventListener("click", submitComment);

});
