import type { FeedbackMode, Language, Persona, Problem } from '../lib/types';
import { createStore, useStore } from './store';

/** What the setup screen hands to the interview screen. */
export interface InterviewDraft {
  problem: Problem;
  language: Language;
  persona: Persona;
  feedbackMode: FeedbackMode;
  minutes: number;
  listEntryId?: string;
}

export const draftStore = createStore<InterviewDraft | null>(null);
export const useDraft = () => useStore(draftStore);
