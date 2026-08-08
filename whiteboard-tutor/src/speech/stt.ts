/**
 * Continuous speech recognition via the Web Speech API (Chrome/Edge/Safari).
 * Interim text streams to the caption UI; an utterance is flushed when the
 * user pauses ~2s. Speech onset fires a barge-in callback so the interviewer's
 * TTS can stop talking, like a human would.
 */

export interface SttCallbacks {
  onInterim: (text: string) => void;
  onUtterance: (text: string) => void;
  onSpeechStart: () => void;
  onUnavailable: (reason: string) => void;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: any) => void) | null;
}

const FLUSH_PAUSE_MS = 2000;

export class SpeechListener {
  private recognition: SpeechRecognitionLike | null = null;
  private callbacks: SttCallbacks;
  private running = false;
  private pending = '';
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private speaking = false;

  constructor(callbacks: SttCallbacks) {
    this.callbacks = callbacks;
  }

  static isSupported(): boolean {
    const w = globalThis as any;
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  start(): void {
    const w = globalThis as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      this.callbacks.onUnavailable('Speech recognition is not supported in this browser — use Chrome, or type instead.');
      return;
    }
    this.running = true;
    const rec: SpeechRecognitionLike = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          this.pending += (this.pending ? ' ' : '') + result[0].transcript.trim();
        } else {
          interim += result[0].transcript;
        }
      }
      if ((interim.trim() || this.pending) && !this.speaking) {
        this.speaking = true;
        this.callbacks.onSpeechStart();
      }
      this.callbacks.onInterim(this.pending + (interim ? ' ' + interim : ''));
      this.scheduleFlush();
    };

    rec.onend = () => {
      // Chrome stops recognition every ~60s of audio; restart while running.
      if (this.running) {
        try {
          rec.start();
        } catch {
          /* already restarted */
        }
      }
    };

    rec.onerror = (event: any) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.running = false;
        this.callbacks.onUnavailable('Microphone permission denied — you can type instead.');
      }
      // 'no-speech' and 'aborted' are routine; onend handles the restart.
    };

    this.recognition = rec;
    try {
      rec.start();
    } catch {
      /* start() throws if called while already started */
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), FLUSH_PAUSE_MS);
  }

  private flush(): void {
    this.speaking = false;
    const text = this.pending.trim();
    this.pending = '';
    this.callbacks.onInterim('');
    if (text) this.callbacks.onUtterance(text);
  }

  stop(): void {
    this.running = false;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flush();
    try {
      this.recognition?.stop();
    } catch {
      /* ignore */
    }
    this.recognition = null;
  }
}
