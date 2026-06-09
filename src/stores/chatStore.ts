import { create } from "zustand";
import type { ChatMode, ChatMessage, ChatSession, ChatSessionFull, ContextSnippet, ImpactAnalysis } from "../types/chat";
import {
  listChatSessions,
  loadChatSession,
  saveChatSession,
  deleteChatSession,
  createNewChatSession,
  buildSessionFromMessages,
} from "../lib/chatStorage";

// ─── Save to a specific session on disk (without touching in-memory state) ─
async function appendMessageToSessionOnDisk(
  targetDir: string,
  epicId: string,
  sessionId: string,
  message: ChatMessage
) {
  try {
    const session = await loadChatSession(targetDir, epicId, sessionId);
    if (!session) return;
    session.messages.push(message);
    session.messageCount = session.messages.length;
    session.updatedAt = new Date().toISOString();
    await saveChatSession(targetDir, epicId, session);
  } catch {
    // silent fail
  }
}

// ─── Debounced save ────────────────────────────────────────────────────────
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingSaveSessionId: string | null = null;

function scheduleSave(store: ChatStore, targetDir: string, epicId: string) {
  const sid = store.currentSessionId;
  if (!sid || !targetDir || !epicId) return;

  pendingSaveSessionId = sid;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    flushSave(store, targetDir, epicId);
  }, 500);
}

async function flushSave(store: ChatStore, targetDir: string, epicId: string) {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  const sid = store.currentSessionId;
  if (!sid || !targetDir || !epicId) return;
  // Only save if the session hasn't changed
  if (pendingSaveSessionId && pendingSaveSessionId !== sid) return;
  pendingSaveSessionId = null;

  const session = buildSessionFromMessages(sid, epicId, store.messages, store._currentSessionData ?? undefined);
  try {
    await saveChatSession(targetDir, epicId, session);
    // Update session in the list
    useChatStore.setState((s) => {
      const updated: ChatSession = {
        id: session.id,
        epicId: session.epicId,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messageCount,
        firstMessagePreview: session.firstMessagePreview,
      };
      const sessions = s.sessions.map((sess) => (sess.id === sid ? updated : sess));
      // If not in list yet, add it
      if (!sessions.find((sess) => sess.id === sid)) {
        sessions.unshift(updated);
      }
      return { sessions, _currentSessionData: session };
    });
  } catch {
    // silent fail -- don't break chat UX for a save error
  }
}

// ─── Store Interface ────────────────────────────────────────────────────────

interface ChatStore {
  isOpen: boolean;
  mode: ChatMode;
  messages: ChatMessage[];
  contextSnippets: ContextSnippet[];
  isStreaming: boolean;
  streamingContent: string;
  pendingImpact: ImpactAnalysis | null;
  isAnalyzingImpact: boolean;
  isApplyingChanges: boolean;
  isReviewingCoherency: boolean;
  isAgentWorking: boolean;

  // Session management
  currentSessionId: string | null;
  epicSessionId: string | null; // the original session for epic creation flow
  sessions: ChatSession[];
  sessionsLoaded: boolean;
  _currentSessionData: ChatSessionFull | null;
  _epicId: string | null;
  _targetDir: string | null;

  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  setMode: (mode: ChatMode) => void;
  addMessage: (message: ChatMessage) => void;
  setStreaming: (streaming: boolean) => void;
  updateStreamingContent: (content: string) => void;
  appendStreamingContent: (chunk: string) => void;
  finalizeStreaming: (finalContent: string) => void;
  addContextSnippet: (snippet: ContextSnippet) => void;
  removeContextSnippet: (id: string) => void;
  clearContextSnippets: () => void;
  setPendingImpact: (impact: ImpactAnalysis | null) => void;
  setAnalyzingImpact: (v: boolean) => void;
  setApplyingChanges: (v: boolean) => void;
  setReviewingCoherency: (v: boolean) => void;
  injectActivityMessage: (content: string, label: string, type?: "activity" | "review_result") => void;
  setAgentWorking: (working: boolean) => void;
  injectObjective: (objective: string) => void;
  injectProgress: (label: string, step: string, progressType: "start" | "complete") => void;
  injectClarifyingQA: (question: string, answer: string) => void;
  injectNarrative: (content: string) => void;
  clearChat: () => void;
  resetChat: () => void;

  // Session actions
  loadSessions: (targetDir: string, epicId: string) => Promise<void>;
  switchSession: (targetDir: string, epicId: string, sessionId: string) => Promise<void>;
  createNewSession: (targetDir: string, epicId: string) => Promise<void>;
  deleteSession: (targetDir: string, epicId: string, sessionId: string) => Promise<void>;
  saveCurrentSession: () => Promise<void>;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  isOpen: false,
  mode: "ask",
  messages: [],
  contextSnippets: [],
  isStreaming: false,
  streamingContent: "",
  pendingImpact: null,
  isAnalyzingImpact: false,
  isApplyingChanges: false,
  isReviewingCoherency: false,
  isAgentWorking: false,

  // Session state
  currentSessionId: null,
  epicSessionId: null,
  sessions: [],
  sessionsLoaded: false,
  _currentSessionData: null,
  _epicId: null,
  _targetDir: null,

  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  setMode: (mode) => set({ mode }),

  addMessage: (message) => {
    set((s) => ({ messages: [...s.messages, message] }));
    // Schedule debounced save
    const state = get();
    if (state._targetDir && state._epicId) {
      scheduleSave(get(), state._targetDir, state._epicId);
    }
  },

  setStreaming: (streaming) => set({ isStreaming: streaming }),
  updateStreamingContent: (content) => set({ streamingContent: content }),
  appendStreamingContent: (chunk) =>
    set((s) => ({ streamingContent: s.streamingContent + chunk })),

  finalizeStreaming: (_finalContent) => {
    set({ streamingContent: "", isStreaming: false });
    // Flush save immediately on finalize
    const state = get();
    if (state._targetDir && state._epicId) {
      flushSave(get(), state._targetDir, state._epicId);
    }
  },

  addContextSnippet: (snippet) =>
    set((s) => ({ contextSnippets: [...s.contextSnippets, snippet] })),
  removeContextSnippet: (id) =>
    set((s) => ({
      contextSnippets: s.contextSnippets.filter((sn) => sn.id !== id),
    })),
  clearContextSnippets: () => set({ contextSnippets: [] }),
  setPendingImpact: (impact) => set({ pendingImpact: impact }),
  setAnalyzingImpact: (v) => set({ isAnalyzingImpact: v }),
  setApplyingChanges: (v) => set({ isApplyingChanges: v }),
  setReviewingCoherency: (v) => set({ isReviewingCoherency: v }),

  injectActivityMessage: (content, label, type = "activity") =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: `activity_${Date.now()}`,
          role: "system" as const,
          content,
          timestamp: new Date().toISOString(),
          messageType: type,
          activityLabel: label,
        },
      ],
    })),

  setAgentWorking: (working) => set({ isAgentWorking: working }),

  injectObjective: (objective) =>
    set((s) => {
      if (s.messages.some((m) => m.messageType === "objective")) return s;
      return {
        messages: [
          {
            id: `objective_${Date.now()}`,
            role: "user" as const,
            content: objective,
            timestamp: new Date().toISOString(),
            messageType: "objective",
          },
          ...s.messages,
        ],
      };
    }),

  injectProgress: (label, step, progressType) => {
    const message: ChatMessage = {
      id: `progress_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: "system" as const,
      content: label,
      timestamp: new Date().toISOString(),
      messageType: "progress",
      metadata: { step, progressType },
    };
    const state = get();
    if (state.epicSessionId && state.currentSessionId !== state.epicSessionId && state._targetDir && state._epicId) {
      appendMessageToSessionOnDisk(state._targetDir, state._epicId, state.epicSessionId, message);
    } else {
      set((s) => ({ messages: [...s.messages, message] }));
    }
  },

  injectClarifyingQA: (question, answer) => {
    const state = get();
    const message: ChatMessage = {
      id: `qa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: "system" as const,
      content: `**Q:** ${question}\n\n**A:** ${answer}`,
      timestamp: new Date().toISOString(),
      messageType: "clarifying_qa",
      metadata: { question, answer },
    };
    if (state.epicSessionId && state.currentSessionId !== state.epicSessionId && state._targetDir && state._epicId) {
      appendMessageToSessionOnDisk(state._targetDir, state._epicId, state.epicSessionId, message);
    } else {
      set((s) => {
        if (s.messages.some((m) => m.messageType === "clarifying_qa" && m.metadata?.question === question)) {
          return s;
        }
        return { messages: [...s.messages, message] };
      });
    }
  },

  injectNarrative: (content) => {
    if (!content.trim()) return;
    const message: ChatMessage = {
      id: `narrative_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: "assistant" as const,
      content,
      timestamp: new Date().toISOString(),
    };
    const state = get();
    if (state.epicSessionId && state.currentSessionId !== state.epicSessionId && state._targetDir && state._epicId) {
      appendMessageToSessionOnDisk(state._targetDir, state._epicId, state.epicSessionId, message);
    } else {
      set((s) => ({ messages: [...s.messages, message] }));
    }
  },

  clearChat: () =>
    set({
      messages: [],
      contextSnippets: [],
      streamingContent: "",
      isStreaming: false,
      pendingImpact: null,
      isAnalyzingImpact: false,
      isApplyingChanges: false,
      isReviewingCoherency: false,
      isAgentWorking: false,
    }),

  resetChat: () =>
    set({
      isOpen: false,
      mode: "ask" as const,
      messages: [],
      contextSnippets: [],
      streamingContent: "",
      isStreaming: false,
      pendingImpact: null,
      isAnalyzingImpact: false,
      isApplyingChanges: false,
      isReviewingCoherency: false,
      isAgentWorking: false,
      currentSessionId: null,
      epicSessionId: null,
      sessions: [],
      sessionsLoaded: false,
      _currentSessionData: null,
      _epicId: null,
      _targetDir: null,
    }),

  // ─── Session Actions ──────────────────────────────────────────────────

  loadSessions: async (targetDir, epicId) => {
    // Save current session before switching context
    const state = get();
    if (state.currentSessionId && state._targetDir && state._epicId && state.messages.length > 0) {
      await flushSave(state, state._targetDir, state._epicId);
    }

    set({ _targetDir: targetDir, _epicId: epicId, sessionsLoaded: false });

    try {
      const sessions = await listChatSessions(targetDir, epicId);
      if (sessions.length > 0) {
        // Load the most recent session
        const mostRecent = sessions[0];
        // The oldest session is the epic creation session
        const oldest = sessions[sessions.length - 1];
        const full = await loadChatSession(targetDir, epicId, mostRecent.id);
        set({
          sessions,
          sessionsLoaded: true,
          currentSessionId: mostRecent.id,
          epicSessionId: oldest.id,
          messages: full?.messages ?? [],
          _currentSessionData: full,
          // Reset transient state
          contextSnippets: [],
          streamingContent: "",
          isStreaming: false,
          pendingImpact: null,
          isAnalyzingImpact: false,
          isApplyingChanges: false,
          isReviewingCoherency: false,
          isAgentWorking: false,
        });
      } else {
        // Create a new session — this is the epic creation session
        const newSession = createNewChatSession(epicId);
        set({
          sessions: [],
          sessionsLoaded: true,
          currentSessionId: newSession.id,
          epicSessionId: newSession.id,
          messages: [],
          _currentSessionData: newSession,
          contextSnippets: [],
          streamingContent: "",
          isStreaming: false,
          pendingImpact: null,
          isAnalyzingImpact: false,
          isApplyingChanges: false,
          isReviewingCoherency: false,
          isAgentWorking: false,
        });
      }
    } catch {
      // If loading fails, start fresh
      const newSession = createNewChatSession(epicId);
      set({
        sessions: [],
        sessionsLoaded: true,
        currentSessionId: newSession.id,
        epicSessionId: newSession.id,
        messages: [],
        _currentSessionData: newSession,
      });
    }
  },

  switchSession: async (targetDir, epicId, sessionId) => {
    const state = get();
    if (state.currentSessionId === sessionId) return;

    // Save current session first
    if (state.currentSessionId && state.messages.length > 0) {
      await flushSave(state, targetDir, epicId);
    }

    // Load the target session
    const full = await loadChatSession(targetDir, epicId, sessionId);
    set({
      currentSessionId: sessionId,
      messages: full?.messages ?? [],
      _currentSessionData: full,
      contextSnippets: [],
      streamingContent: "",
      isStreaming: false,
      pendingImpact: null,
      isAnalyzingImpact: false,
      isApplyingChanges: false,
      isReviewingCoherency: false,
      isAgentWorking: false,
    });
  },

  createNewSession: async (targetDir, epicId) => {
    const state = get();

    // Save current session first
    if (state.currentSessionId && state.messages.length > 0) {
      await flushSave(state, targetDir, epicId);
    }

    const newSession = createNewChatSession(epicId);
    // Save immediately so it appears in the list
    await saveChatSession(targetDir, epicId, newSession);

    const sessionMeta: ChatSession = {
      id: newSession.id,
      epicId: newSession.epicId,
      title: newSession.title,
      createdAt: newSession.createdAt,
      updatedAt: newSession.updatedAt,
      messageCount: 0,
      firstMessagePreview: "",
    };

    set((s) => ({
      currentSessionId: newSession.id,
      sessions: [sessionMeta, ...s.sessions],
      messages: [],
      _currentSessionData: newSession,
      contextSnippets: [],
      streamingContent: "",
      isStreaming: false,
      pendingImpact: null,
      isAnalyzingImpact: false,
      isApplyingChanges: false,
      isReviewingCoherency: false,
      isAgentWorking: false,
    }));
  },

  deleteSession: async (targetDir, epicId, sessionId) => {
    await deleteChatSession(targetDir, epicId, sessionId);

    const state = get();
    const remaining = state.sessions.filter((s) => s.id !== sessionId);

    if (state.currentSessionId === sessionId) {
      // Switch to next available or create new
      if (remaining.length > 0) {
        const next = remaining[0];
        const full = await loadChatSession(targetDir, epicId, next.id);
        set({
          sessions: remaining,
          currentSessionId: next.id,
          messages: full?.messages ?? [],
          _currentSessionData: full,
          contextSnippets: [],
          streamingContent: "",
          isStreaming: false,
          pendingImpact: null,
        });
      } else {
        const newSession = createNewChatSession(epicId);
        set({
          sessions: [],
          currentSessionId: newSession.id,
          messages: [],
          _currentSessionData: newSession,
          contextSnippets: [],
          streamingContent: "",
          isStreaming: false,
          pendingImpact: null,
        });
      }
    } else {
      set({ sessions: remaining });
    }
  },

  saveCurrentSession: async () => {
    const state = get();
    if (state._targetDir && state._epicId) {
      await flushSave(state, state._targetDir, state._epicId);
    }
  },
}));
