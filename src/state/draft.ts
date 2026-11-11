import type { FeedbackMode, Language, Persona, Problem, UsageRecord } from '../lib/types';
import { createStore, useStore } from './store';

/** What the setup screen hands to the interview screen. */
export interface InterviewDraft {
  problem: Problem;
  language: Language;
  persona: Persona;
  feedbackMode: FeedbackMode;
  minutes: number;
  listEntryId?: string;
  /** Usage from preparing a pasted problem or variation, added to the session's cost. */
  prepUsage?: UsageRecord[];
}

export const draftStore = createStore<InterviewDraft | null>(null);
export const useDraft = () => useStore(draftStore);
