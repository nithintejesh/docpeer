import { readFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import type {
  CommentThread,
  ReviewRequest,
  TextAnchor,
} from "../shared/types.js";

const client = new Anthropic();

const PERSONA_PROMPTS: Record<string, string> = {
  general:
    "Review this document for clarity, logic, structure, and completeness. Leave specific comments on passages that need improvement.",
  "devils-advocate":
    "Challenge every claim in this document. Question assumptions, ask for evidence, point out logical gaps. Be constructively adversarial.",
  "technical-depth":
    "Review for technical depth and correctness. Are there missing edge cases? Unexplored failure modes? Gaps in the reasoning?",
  clarity:
    "Review for clarity and readability. Flag jargon, ambiguous phrasing, unclear references, and passages that would confuse a new reader.",
};

interface ReviewComment {
  anchor: TextAnchor;
  text: string;
}

const reviewTool = {
  name: "add_review_comments",
  description:
    "Add review comments to specific text passages in the document. Each comment should reference the exact text being commented on.",
  input_schema: {
    type: "object" as const,
    properties: {
      comments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            anchor_text: {
              type: "string",
              description:
                "The exact text passage being commented on (20-80 chars, must appear verbatim in the document)",
            },
            context_before: {
              type: "string",
              description: "10-30 chars immediately before the anchor text",
            },
            context_after: {
              type: "string",
              description: "10-30 chars immediately after the anchor text",
            },
            comment: {
              type: "string",
              description: "Your review comment or question about this passage",
            },
          },
          required: [
            "anchor_text",
            "context_before",
            "context_after",
            "comment",
          ],
        },
      },
    },
    required: ["comments"],
  },
};

export async function reviewDocument(
  req: ReviewRequest,
  onComment: (comment: ReviewComment) => void
): Promise<void> {
  const content = readFileSync(req.filePath, "utf-8");
  const persona =
    req.persona === "custom" && req.customPrompt
      ? req.customPrompt
      : PERSONA_PROMPTS[req.persona] || PERSONA_PROMPTS.general;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    tools: [reviewTool],
    tool_choice: { type: "tool", name: "add_review_comments" },
    messages: [
      {
        role: "user",
        content: `${persona}\n\nHere is the document to review:\n\n---\n${content}\n---\n\nLeave 5-10 specific, actionable comments on different passages. Each comment should reference exact text from the document.`,
      },
    ],
  });

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "add_review_comments") {
      const input = block.input as {
        comments: Array<{
          anchor_text: string;
          context_before: string;
          context_after: string;
          comment: string;
        }>;
      };

      for (const c of input.comments) {
        if (content.includes(c.anchor_text)) {
          onComment({
            anchor: {
              text: c.anchor_text,
              contextBefore: c.context_before,
              contextAfter: c.context_after,
            },
            text: c.comment,
          });
        }
      }
    }
  }
}

export async function replyToThread(
  filePath: string,
  thread: CommentThread
): Promise<string | null> {
  const content = readFileSync(filePath, "utf-8");

  const threadContext = thread.messages
    .map((m) => `${m.author === "ai" ? "AI" : "Human"}: ${m.text}`)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are reviewing a document and having a discussion about a specific passage.

The passage being discussed: "${thread.anchor.text}"

Full document context (relevant section):
${extractContext(content, thread.anchor.text, 500)}

Discussion so far:
${threadContext}

The human just replied. Respond to their point. Be concise (2-4 sentences). Either:
- Accept their explanation if it's convincing
- Push back with a specific counter-point if you disagree
- Suggest a concrete text improvement if appropriate

Reply directly — no preamble.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock ? (textBlock as { type: "text"; text: string }).text : null;
}

function extractContext(
  content: string,
  anchorText: string,
  windowSize: number
): string {
  const idx = content.indexOf(anchorText);
  if (idx === -1) return content.substring(0, windowSize * 2);
  const start = Math.max(0, idx - windowSize);
  const end = Math.min(content.length, idx + anchorText.length + windowSize);
  return content.substring(start, end);
}
