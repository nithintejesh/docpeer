export interface TextAnchor {
  text: string;
  contextBefore: string;
  contextAfter: string;
  blockIndex?: number;
}

export interface ThreadMessage {
  id: string;
  author: "human" | "ai";
  text: string;
  timestamp: number;
}

export interface CommentThread {
  id: string;
  anchor: TextAnchor;
  status: "open" | "resolved";
  unread: boolean;
  messages: ThreadMessage[];
  createdAt: number;
}

export interface ReviewFile {
  filePath: string;
  threads: CommentThread[];
  lastReviewedAt?: number;
}

export type ReviewPersona =
  | "general"
  | "devils-advocate"
  | "technical-depth"
  | "clarity"
  | "custom";

export interface ReviewRequest {
  filePath: string;
  persona: ReviewPersona;
  customPrompt?: string;
}

export interface WsMessage {
  type:
    | "doc-update"
    | "threads-update"
    | "new-comment"
    | "reply"
    | "resolve"
    | "review-start"
    | "review-progress"
    | "review-done"
    | "ai-reply";
  payload: unknown;
}
