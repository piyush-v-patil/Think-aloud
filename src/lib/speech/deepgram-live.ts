/**
 * Deepgram live transcription over a WebSocket, straight from the browser.
 * The key travels as a WebSocket subprotocol (a header), never in the URL.
 */
import { SpeechError, type ClockFn, type LiveTranscriber, type LiveTranscriberEvents } from './types';
import { SPEECH_ENGINES } from '../../config/speech';
import { pickMimeType } from '../audio/recorder';

interface DgResult {
  type: string;
  is_final?: boolean;
  start?: number;
  duration?: number;
  channel?: { alternatives?: { transcript: string; words?: { word: string; punctuated_word?: string; start: number; end: number }[] }[] };
}

export class DeepgramLiveTranscriber implements LiveTranscriber {
  readonly engine = 'deepgram' as const;
  private key: string;
  private clock: ClockFn;
  private hints: string[] = [];
  private ws: WebSocket | null = null;
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private keepAlive?: ReturnType<typeof setInterval>;
  private streamStart = 0;
  private stopping = false;
  private makeSocket: (url: string, protocols: string[]) => WebSocket;
  /** Seconds of audio streamed, for the session cost. */
  secondsStreamed = 0;

  constructor(key: string, clock: ClockFn, makeSocket: (url: string, protocols: string[]) => WebSocket = (u, p) => new WebSocket(u, p)) {
    this.key = key;
    this.clock = clock;
    this.makeSocket = makeSocket;
  }

  setHints(terms: string[]) {
    this.hints = terms;
  }

  url(): string {
    const p = new URLSearchParams({
      model: SPEECH_ENGINES.deepgram.liveModel!,
      interim_results: 'true',
      smart_format: 'true',
      punctuate: 'true',
      vad_events: 'true',
      utterance_end_ms: '1200',
    });
    for (const h of this.hints.slice(0, 50)) p.append('keyterm', h);
    return `wss://api.deepgram.com/v1/listen?${p}`;
  }

  async start(events: LiveTranscriberEvents): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      throw new SpeechError('mic-denied', 'Microphone access was blocked.');
    }
    await this.connect(events);
  }

  /** Connects using an existing microphone stream (exposed for tests). */
  connect(events: LiveTranscriberEvents, stream: MediaStream | null = this.stream): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = this.makeSocket(this.url(), ['token', this.key]);
      this.ws = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        this.streamStart = this.clock();
        if (stream && typeof MediaRecorder !== 'undefined') {
          const mime = pickMimeType();
          const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
          rec.ondataavailable = (e) => {
            if (e.data.size && ws.readyState === WebSocket.OPEN) ws.send(e.data);
          };
          rec.start(250);
          this.rec = rec;
        }
        this.keepAlive = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'KeepAlive' })), 8000);
        resolve();
      };
      ws.onmessage = (e) => {
        let msg: DgResult;
        try {
          msg = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (msg.type === 'SpeechStarted') events.onActivity?.(true);
        if (msg.type === 'UtteranceEnd') events.onActivity?.(false);
        if (msg.type !== 'Results') return;
        const alt = msg.channel?.alternatives?.[0];
        const text = alt?.transcript?.trim() ?? '';
        if (msg.start !== undefined && msg.duration !== undefined) this.secondsStreamed = Math.max(this.secondsStreamed, msg.start + msg.duration);
        if (!text) return;
        if (!msg.is_final) {
          events.onInterim?.(text);
          return;
        }
        const at = (sec: number) => Math.round(this.streamStart + sec * 1000);
        const words = alt?.words?.map((w) => ({ w: w.punctuated_word ?? w.word, t0: at(w.start), t1: at(w.end) }));
        events.onPhrase?.({ text, t0: at(msg.start ?? 0), t1: at((msg.start ?? 0) + (msg.duration ?? 0)), ...(words?.length ? { words } : {}) });
        events.onInterim?.('');
      };
      ws.onerror = () => {
        if (!opened) reject(new SpeechError('network', 'Could not connect to Deepgram.'));
      };
      ws.onclose = (e) => {
        clearInterval(this.keepAlive);
        if (!opened) {
          reject(new SpeechError(e.code === 1008 || e.code === 4001 ? 'invalid-key' : 'network', 'Could not connect to Deepgram.'));
          return;
        }
        if (!this.stopping) events.onError?.(new SpeechError('network', 'The connection to Deepgram closed.'), true);
      };
    });
  }

  stop() {
    this.stopping = true;
    clearInterval(this.keepAlive);
    try {
      this.rec?.stop();
    } catch {
      // ignore
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      this.ws.close(1000);
    }
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}
