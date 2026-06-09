import type { FrontendStreamEvent } from "../types/execution";

/**
 * Extract a text summary from stream events.
 * Concatenates all "text" events; if too long, keeps the tail (conclusion).
 * Falls back to the last status/complete/error message.
 */
export function extractStreamSummary(events: FrontendStreamEvent[]): string {
  let text = "";
  for (const e of events) {
    if (e.kind === "text") text += e.content;
  }

  if (text.length > 2000) {
    text = "…" + text.slice(-1500);
  }

  if (text.trim()) return text.trim();

  // Fallback: last meaningful event
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === "complete") return "Processing complete.";
    if (e.kind === "error") return `Error: ${e.message}`;
    if (e.kind === "status") return e.message;
  }

  return "Processing complete.";
}

/**
 * Extract a shorter, chat-friendly narrative from stream events.
 * Keeps the tail (conclusions) and returns empty string if no text content.
 */
export function extractChatNarrative(events: FrontendStreamEvent[]): string {
  let text = "";
  for (const e of events) {
    if (e.kind === "text") text += e.content;
  }

  if (!text.trim()) return "";

  if (text.length > 800) {
    text = "…" + text.slice(-600);
  }

  return text.trim();
}
