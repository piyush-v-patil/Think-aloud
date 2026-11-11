import type { FeedbackMode, Language, ModelRole, Persona, PresetId, ProviderId } from '../lib/types';
import { DEFAULT_SESSION_MINUTES } from '../config/app';
import { readLocal, writeLocal } from '../lib/storage/local';
import { createStore, useStore } from './store';

export type ThemeSetting = 'light' | 'dark' | 'system';
export type LiveSpeechChoice = 'browser' | 'whisper-local' | 'text';
export type PaidSpeechEngine = 'deepgram' | 'assemblyai' | 'openai';

export interface CustomEndpointSettings {
  baseUrl: string;
  /** Model names for each preset tier; the user types these. */
  models: { small: string; mid: string; top: string };
  /** Optional prices in USD per million tokens. Without them, costs show as token counts. */
  prices?: { input: number; output: number; cachedInput?: number };
}

export interface Settings {
  theme: ThemeSetting;
  provider: ProviderId;
  preset: PresetId;
  /** Per-role model choices for the Advanced preset, per provider. */
  advancedModels: Partial<Record<ProviderId, Record<ModelRole, string>>>;
  persona: Persona;
  feedbackMode: FeedbackMode;
  language: Language;
  sessionMinutes: number;
  speech: {
    /** Free engine used live when no paid live engine is on. */
    liveEngine: LiveSpeechChoice;
    paidEngine: PaidSpeechEngine | null;
    /** Transcribe the recording again after the interview for accurate scoring. */
    accuratePass: boolean;
    /** Use the paid engine live instead of the browser engine. */
    paidLive: boolean;
    /** Use the OpenAI AI key for transcription too. */
    reuseOpenAIKey: boolean;
  };
  custom: CustomEndpointSettings;
  monthlyLimitUsd: number | null;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  provider: 'anthropic',
  preset: 'balanced',
  advancedModels: {},
  persona: 'neutral',
  feedbackMode: 'training',
  language: 'python',
  sessionMinutes: DEFAULT_SESSION_MINUTES,
  speech: { liveEngine: 'browser', paidEngine: null, accuratePass: true, paidLive: false, reuseOpenAIKey: false },
  custom: { baseUrl: 'http://localhost:11434/v1', models: { small: '', mid: '', top: '' } },
  monthlyLimitUsd: null,
  onboarded: false,
};

function load(): Settings {
  const saved = readLocal<Partial<Settings>>('settings', {});
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    speech: { ...DEFAULT_SETTINGS.speech, ...saved.speech },
    custom: { ...DEFAULT_SETTINGS.custom, ...saved.custom },
  };
}

export const settingsStore = createStore<Settings>(load());
settingsStore.subscribe(() => writeLocal('settings', settingsStore.get()));

export function updateSettings(patch: Partial<Settings>) {
  settingsStore.set((s) => ({ ...s, ...patch }));
}

export function useSettings(): Settings {
  return useStore(settingsStore);
}

export function resetSettings() {
  settingsStore.set(DEFAULT_SETTINGS);
}

/** Applies the theme to <html>, following the device when set to "system". */
export function applyTheme(theme: ThemeSetting) {
  const dark =
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
