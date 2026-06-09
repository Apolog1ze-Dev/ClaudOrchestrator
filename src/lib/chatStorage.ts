import { mkdir, readDir, readTextFile, writeTextFile, exists, remove } from "@tauri-apps/plugin-fs";
import { nanoid } from "nanoid";
import type { ChatSession, ChatSessionFull, ChatMessage } from "../types/chat";

function getChatDir(targetDir: string, epicId: string): string {
  return `${targetDir}/.claudorchestrator/epics/${epicId}/chats`;
}

function getSessionPath(targetDir: string, epicId: string, sessionId: string): string {
  return `${getChatDir(targetDir, epicId)}/${sessionId}.json`;
}

async function ensureChatDir(targetDir: string, epicId: string): Promise<void> {
  const dir = getChatDir(targetDir, epicId);
  const dirExists = await exists(dir);
  if (!dirExists) {
    await mkdir(dir, { recursive: true });
  }
}

export async function listChatSessions(
  targetDir: string,
  epicId: string
): Promise<ChatSession[]> {
  const dir = getChatDir(targetDir, epicId);
  const dirExists = await exists(dir);
  if (!dirExists) return [];

  const entries = await readDir(dir);
  const sessions: ChatSession[] = [];

  for (const entry of entries) {
    if (!entry.name.endsWith(".json") || entry.isDirectory) continue;
    try {
      const content = await readTextFile(`${dir}/${entry.name}`);
      const data = JSON.parse(content) as ChatSessionFull;
      // Extract metadata only (omit messages for listing)
      sessions.push({
        id: data.id,
        epicId: data.epicId,
        title: data.title,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        messageCount: data.messageCount,
        firstMessagePreview: data.firstMessagePreview,
      });
    } catch {
      // skip corrupt files
    }
  }

  // Sort by most recently updated first
  sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return sessions;
}

export async function loadChatSession(
  targetDir: string,
  epicId: string,
  sessionId: string
): Promise<ChatSessionFull | null> {
  const path = getSessionPath(targetDir, epicId, sessionId);
  const fileExists = await exists(path);
  if (!fileExists) return null;

  try {
    const content = await readTextFile(path);
    return JSON.parse(content) as ChatSessionFull;
  } catch {
    return null;
  }
}

export async function saveChatSession(
  targetDir: string,
  epicId: string,
  session: ChatSessionFull
): Promise<void> {
  await ensureChatDir(targetDir, epicId);
  const path = getSessionPath(targetDir, epicId, session.id);

  // Update metadata from messages
  const userMessages = session.messages.filter((m) => m.role === "user");
  const firstUserMsg = userMessages[0];
  session.messageCount = session.messages.length;
  session.updatedAt = new Date().toISOString();
  if (firstUserMsg && session.title === "New Chat") {
    session.title = firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? "..." : "");
    session.firstMessagePreview = firstUserMsg.content.slice(0, 100);
  }

  await writeTextFile(path, JSON.stringify(session, null, 2));
}

export async function deleteChatSession(
  targetDir: string,
  epicId: string,
  sessionId: string
): Promise<void> {
  const path = getSessionPath(targetDir, epicId, sessionId);
  const fileExists = await exists(path);
  if (fileExists) {
    await remove(path);
  }
}

export function createNewChatSession(epicId: string): ChatSessionFull {
  const now = new Date().toISOString();
  return {
    id: nanoid(),
    epicId,
    title: "New Chat",
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    firstMessagePreview: "",
    messages: [],
  };
}

/**
 * Build a ChatSessionFull from the current store state for saving.
 */
export function buildSessionFromMessages(
  sessionId: string,
  epicId: string,
  messages: ChatMessage[],
  existingSession?: ChatSessionFull
): ChatSessionFull {
  const userMessages = messages.filter((m) => m.role === "user");
  const firstUserMsg = userMessages[0];
  const now = new Date().toISOString();

  return {
    id: sessionId,
    epicId,
    title: existingSession?.title === "New Chat" && firstUserMsg
      ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? "..." : "")
      : existingSession?.title ?? "New Chat",
    createdAt: existingSession?.createdAt ?? now,
    updatedAt: now,
    messageCount: messages.length,
    firstMessagePreview: firstUserMsg?.content.slice(0, 100) ?? "",
    messages,
  };
}
