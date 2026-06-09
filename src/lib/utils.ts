import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { EpicStatus, TicketStatus, PhaseStatus } from "../types/epic";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

// ─── Quota Units (QU) ────────────────────────────────────────────────────────
// QU normalizes API-equivalent USD cost against the user's plan multiplier,
// so the same API call shows as 300 QU on Pro (1x) but 15 QU on Max 20x.

export function toQuotaUnits(costUsd: number, usageMultiplier: number): number {
  return (costUsd * 1000) / (usageMultiplier || 1);
}

export function formatQuotaUnits(qu: number): string {
  if (qu < 1) return `${qu.toFixed(2)} QU`;
  if (qu < 100) return `${qu.toFixed(1)} QU`;
  return `${Math.round(qu).toLocaleString()} QU`;
}

export function quotaImpactColor(qu: number): string {
  if (qu < 50) return "text-emerald-400";
  if (qu < 200) return "text-amber-400";
  return "text-red-400";
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export const STATUS_COLORS: Record<EpicStatus | TicketStatus | PhaseStatus, string> = {
  draft: "text-neutral-400 bg-neutral-400/10",
  speccing: "text-amber-400 bg-amber-400/10",
  decomposing: "text-amber-400 bg-amber-400/10",
  planning: "text-amber-400 bg-amber-400/10",
  ready: "text-blue-400 bg-blue-400/10",
  executing: "text-emerald-400 bg-emerald-400/10",
  verifying: "text-orange-400 bg-orange-400/10",
  completed: "text-emerald-400 bg-emerald-400/10",
  failed: "text-red-400 bg-red-400/10",
  paused: "text-neutral-400 bg-neutral-400/10",
  todo: "text-neutral-400 bg-neutral-400/10",
  in_progress: "text-emerald-400 bg-emerald-400/10",
  done: "text-emerald-400 bg-emerald-400/10",
  blocked: "text-red-400 bg-red-400/10",
  planned: "text-neutral-400 bg-neutral-400/10",
  passed: "text-emerald-400 bg-emerald-400/10",
  remediating: "text-orange-400 bg-orange-400/10",
};

export function statusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}
