export type ChatMode = "ask" | "refine" | "review";

// ─── Chat Session (persistence) ─────────────────────────────────────────────

export interface ChatSession {
  id: string;
  epicId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  firstMessagePreview: string;
}

export interface ChatSessionFull extends ChatSession {
  messages: ChatMessage[];
}

export interface ContextSnippet {
  id: string;
  text: string;
  sourceType: string; // "prd" | "tech_spec" | "design_spec" | "ticket" | "phase"
  sourceId: string;
  sourceTitle: string;
}

export interface ChatHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export interface ImpactItem {
  document_type: string;
  document_id: string;
  document_title: string;
  section: string;
  description: string;
  severity: "high" | "medium" | "low";
}

export interface ImpactAnalysis {
  impacts: ImpactItem[];
  summary: string;
  risk_level: "low" | "medium" | "high";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  contextSnippets?: ContextSnippet[];
  impactAnalysis?: ImpactAnalysis;
  isStreaming?: boolean;
  messageType?: "impact" | "review" | "applied" | "normal" | "activity" | "review_result" | "objective" | "progress" | "clarifying_qa";
  activityLabel?: string;
  metadata?: {
    step?: string;
    progressType?: "start" | "complete";
    question?: string;
    answer?: string;
  };
}
