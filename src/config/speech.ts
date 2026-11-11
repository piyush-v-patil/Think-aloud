import type { SpeechEngineId } from '../lib/types';

/**
 * Speech-to-text engines and prices, in USD per minute of audio.
 * Checked on 2026-11-11 against each provider's pricing page. Update here
 * when prices change; the cost estimator and session cost read these.
 */
export interface SpeechEngineConfig {
  id: SpeechEngineId;
  label: string;
  /** Who receives the audio. Shown in the privacy statement. */
  audioGoesTo: string;
  paid: boolean;
  /** Price per minute for transcribing a recording after the interview. */
  filePerMinute?: number;
  /** Price per minute for live (streaming) transcription. */
  livePerMinute?: number;
  /** Add-on price per minute when keyword hints are sent. */
  keywordHintsPerMinute?: number;
  fileModel?: string;
  liveModel?: string;
  keyUrl?: string;
  pricingUrl?: string;
  pricesCheckedOn?: string;
}

export const SPEECH_ENGINES: Record<SpeechEngineId, SpeechEngineConfig> = {
  browser: {
    id: 'browser',
    label: 'Browser speech recognition',
    audioGoesTo: "your browser's speech service (for Chrome, Google; for Safari, Apple)",
    paid: false,
  },
  'whisper-local': {
    id: 'whisper-local',
    label: 'Whisper on this device',
    audioGoesTo: 'nowhere; it is transcribed on this device',
    paid: false,
  },
  text: {
    id: 'text',
    label: 'Typing',
    audioGoesTo: 'nowhere',
    paid: false,
  },
  deepgram: {
    id: 'deepgram',
    label: 'Deepgram',
    audioGoesTo: 'Deepgram',
    paid: true,
    fileModel: 'nova-3',
    liveModel: 'nova-3',
    // Streaming is listed at $0.0077/min. Pre-recorded is listed as lower; the
    // pricing FAQ's "$200 covers about 43,000 minutes" gives about $0.0046/min.
    filePerMinute: 0.0046,
    livePerMinute: 0.0077,
    keywordHintsPerMinute: 0.0013,
    keyUrl: 'https://console.deepgram.com/',
    pricingUrl: 'https://deepgram.com/pricing',
    pricesCheckedOn: '2026-11-11',
  },
  assemblyai: {
    id: 'assemblyai',
    label: 'AssemblyAI',
    audioGoesTo: 'AssemblyAI',
    paid: true,
    fileModel: 'universal-3.5-pro',
    liveModel: 'universal-streaming',
    filePerMinute: 0.21 / 60,
    livePerMinute: 0.15 / 60,
    keywordHintsPerMinute: 0.05 / 60,
    keyUrl: 'https://www.assemblyai.com/dashboard/api-keys',
    pricingUrl: 'https://www.assemblyai.com/pricing',
    pricesCheckedOn: '2026-11-11',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    audioGoesTo: 'OpenAI',
    paid: true,
    fileModel: 'gpt-transcribe',
    liveModel: 'gpt-live-transcribe',
    filePerMinute: 0.0045,
    livePerMinute: 0.017,
    keyUrl: 'https://platform.openai.com/api-keys',
    pricingUrl: 'https://developers.openai.com/api/docs/pricing',
    pricesCheckedOn: '2026-11-11',
  },
};
