import { create } from "zustand";
import type { Epic, Ticket, Phase, Spec } from "../types/epic";

interface EpicStore {
  // State
  epics: Epic[];
  currentEpic: Epic | null;
  tickets: Record<string, Ticket[]>; // epicId -> tickets
  phases: Record<string, Phase[]>; // ticketId -> phases
  specs: Record<string, Spec[]>; // epicId -> specs
  loading: boolean;
  error: string | null;

  // Actions
  setEpics: (epics: Epic[]) => void;
  setCurrentEpic: (epic: Epic | null) => void;
  addEpic: (epic: Epic) => void;
  updateEpic: (epic: Epic) => void;
  removeEpic: (epicId: string) => void;
  setTickets: (epicId: string, tickets: Ticket[]) => void;
  updateTicket: (epicId: string, ticket: Ticket) => void;
  setPhases: (ticketId: string, phases: Phase[]) => void;
  updatePhase: (ticketId: string, phase: Phase) => void;
  setSpecs: (epicId: string, specs: Spec[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  resetEpics: () => void;
}

export const useEpicStore = create<EpicStore>((set) => ({
  epics: [],
  currentEpic: null,
  tickets: {},
  phases: {},
  specs: {},
  loading: false,
  error: null,

  setEpics: (epics) => set({ epics }),
  setCurrentEpic: (epic) => set({ currentEpic: epic }),

  addEpic: (epic) =>
    set((state) => ({ epics: [epic, ...state.epics] })),

  updateEpic: (epic) =>
    set((state) => ({
      epics: state.epics.map((e) => (e.id === epic.id ? epic : e)),
      currentEpic:
        state.currentEpic?.id === epic.id ? epic : state.currentEpic,
    })),

  removeEpic: (epicId) =>
    set((state) => ({
      epics: state.epics.filter((e) => e.id !== epicId),
      currentEpic:
        state.currentEpic?.id === epicId ? null : state.currentEpic,
    })),

  setTickets: (epicId, tickets) =>
    set((state) => ({
      tickets: { ...state.tickets, [epicId]: tickets },
    })),

  updateTicket: (epicId, ticket) =>
    set((state) => ({
      tickets: {
        ...state.tickets,
        [epicId]: (state.tickets[epicId] ?? []).map((t) =>
          t.id === ticket.id ? ticket : t
        ),
      },
    })),

  setPhases: (ticketId, phases) =>
    set((state) => ({
      phases: { ...state.phases, [ticketId]: phases },
    })),

  updatePhase: (ticketId, phase) =>
    set((state) => ({
      phases: {
        ...state.phases,
        [ticketId]: (state.phases[ticketId] ?? []).map((p) =>
          p.id === phase.id ? phase : p
        ),
      },
    })),

  setSpecs: (epicId, specs) =>
    set((state) => ({
      specs: { ...state.specs, [epicId]: specs },
    })),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  resetEpics: () =>
    set({
      epics: [],
      currentEpic: null,
      tickets: {},
      phases: {},
      specs: {},
      loading: false,
      error: null,
    }),
}));
