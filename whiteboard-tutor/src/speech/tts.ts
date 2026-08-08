/**
 * Interviewer voice. OpenAI TTS when a key is present (natural), browser
 * speechSynthesis otherwise. One queue, and barge-in support: when the
 * candidate starts talking, the interviewer stops mid-sentence like a human.
 */

export interface VoiceOptions {
  openaiKey: string | null;
  /** OpenAI voice name; 'ash' and 'alloy' both read as neutral-professional. */
  voice?: string;
}

export class Voice {
  private opts: VoiceOptions;
  private audio: HTMLAudioElement | null = null;
  private queue: string[] = [];
  private playing = false;
  private cancelled = false;
  onStateChange: ((speaking: boolean) => void) | null = null;

  constructor(opts: VoiceOptions) {
    this.opts = opts;
  }

  speak(text: string): void {
    this.cancelled = false;
    this.queue.push(text);
    if (!this.playing) void this.drain();
  }

  /** Barge-in: drop everything queued and stop the current line immediately. */
  cancel(): void {
    this.cancelled = true;
    this.queue = [];
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.setPlaying(false);
  }

  private setPlaying(playing: boolean): void {
    this.playing = playing;
    this.onStateChange?.(playing);
  }

  private async drain(): Promise<void> {
    this.setPlaying(true);
    while (this.queue.length && !this.cancelled) {
      const text = this.queue.shift()!;
      try {
        if (this.opts.openaiKey) {
          await this.speakOpenAI(text);
        } else {
          await this.speakBrowser(text);
        }
      } catch {
        // TTS failure is non-fatal — captions still carry the line.
        if (this.opts.openaiKey) {
          try {
            await this.speakBrowser(text);
          } catch {
            /* give up on audio for this line */
          }
        }
      }
    }
    this.setPlaying(false);
  }

  private async speakOpenAI(text: string): Promise<void> {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.opts.openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: this.opts.voice ?? 'ash',
        input: text,
        response_format: 'mp3',
      }),
    });
    if (!res.ok) throw new Error(`TTS request failed: ${res.status}`);
    const blob = await res.blob();
    if (this.cancelled) return;
    const url = URL.createObjectURL(blob);
    try {
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        this.audio = audio;
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('audio playback failed'));
        audio.onpause = () => resolve(); // cancel() pauses — treat as done
        void audio.play().catch(reject);
      });
    } finally {
      this.audio = null;
      URL.revokeObjectURL(url);
    }
  }

  private speakBrowser(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (typeof speechSynthesis === 'undefined') {
        resolve();
        return;
      }
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.onend = finish;
      utterance.onerror = finish;
      // Chrome's onend is unreliable (and absent headless) — cap the wait.
      setTimeout(finish, Math.min(30_000, 3000 + text.length * 90));
      speechSynthesis.speak(utterance);
    });
  }
}
