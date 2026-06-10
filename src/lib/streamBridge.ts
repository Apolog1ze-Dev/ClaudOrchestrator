import type { FrontendStreamEvent } from "../types/execution";

/**
 * Append a streamed batch onto an event list, concatenating consecutive
 * text/text and thinking/thinking events. With token-level deltas enabled,
 * every token arrives as its own event — without coalescing, 100 thinking
 * tokens become 100 list entries (and 100 rendered blocks).
 */
export function appendCoalesced(
  prev: FrontendStreamEvent[],
  batch: FrontendStreamEvent[]
): FrontendStreamEvent[] {
  if (batch.length === 0) return prev;
  const out = prev.slice();
  for (const event of batch) {
    const last = out[out.length - 1];
    if (
      last &&
      ((event.kind === "text" && last.kind === "text") ||
        (event.kind === "thinking" && last.kind === "thinking"))
    ) {
      out[out.length - 1] = { ...last, content: last.content + event.content };
    } else {
      out.push(event);
    }
  }
  return out;
}

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
