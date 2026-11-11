/**
 * Records the microphone for the replay with MediaRecorder. The recording's
 * start is stamped on the session clock so playback lines up with the
 * transcript and code.
 */
export interface Recording {
  blob: Blob;
  mimeType: string;
  /** Session-clock time at which the recording started. */
  offsetMs: number;
}

const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

export class AudioRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private offsetMs = 0;
  private mimeType = '';
  stream: MediaStream | null = null;

  /** Asks for the microphone. Throws a DOMException if denied or missing. */
  async start(clock: () => number): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (typeof MediaRecorder === 'undefined') return;
    this.mimeType = pickMimeType();
    const rec = new MediaRecorder(this.stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.offsetMs = clock();
    rec.start(1000);
    this.recorder = rec;
  }

  /** Stops and returns the recording, or null if nothing was recorded. */
  stop(): Promise<Recording | null> {
    const rec = this.recorder;
    const finish = () => {
      this.stream?.getTracks().forEach((t) => t.stop());
      if (!this.chunks.length) return null;
      const type = this.mimeType || this.chunks[0].type || 'audio/webm';
      return { blob: new Blob(this.chunks, { type }), mimeType: type, offsetMs: this.offsetMs };
    };
    if (!rec || rec.state === 'inactive') return Promise.resolve(finish());
    return new Promise((resolve) => {
      rec.onstop = () => resolve(finish());
      rec.stop();
    });
  }
}
