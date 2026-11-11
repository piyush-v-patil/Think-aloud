/** Which speech engines a session uses, from settings and available keys. */
import type { SpeechEngineId } from '../types';
import type { Settings } from '../../state/settings';
import { getKey, type KeyName } from '../../state/keys';
import { SPEECH_ENGINES } from '../../config/speech';
import { browserSpeechSupported } from './browser';

export function speechKeyName(engine: SpeechEngineId, settings: Settings): KeyName | null {
  if (engine === 'deepgram') return 'deepgram';
  if (engine === 'assemblyai') return 'assemblyai';
  if (engine === 'openai') return settings.speech.reuseOpenAIKey && settings.provider === 'openai' ? 'openai' : 'openai-speech';
  return null;
}

export function speechKey(engine: SpeechEngineId, settings: Settings): string | undefined {
  const name = speechKeyName(engine, settings);
  return name ? getKey(name) : undefined;
}

export function chooseLiveEngine(settings: Settings, browserOk = browserSpeechSupported()): SpeechEngineId {
  const paid = settings.speech.paidEngine;
  if (paid && settings.speech.paidLive && SPEECH_ENGINES[paid].liveInBrowser && speechKey(paid, settings)) return paid;
  if (settings.speech.liveEngine === 'text' || !browserOk) return 'text';
  return 'browser';
}

export function chooseAccurateEngine(settings: Settings): SpeechEngineId | undefined {
  const paid = settings.speech.paidEngine;
  if (paid && settings.speech.accuratePass && speechKey(paid, settings)) return paid;
  if (settings.speech.onDevice) return 'whisper-local';
  return undefined;
}
