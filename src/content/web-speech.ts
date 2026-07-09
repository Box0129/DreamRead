import type { DreamReadSettings } from '../tts/types';
import { splitByLanguage, splitIntoSpeechUnits, splitTextIntoChunks } from '../shared/text-utils';
import { pickVoiceForLang, waitForVoices } from '../shared/voices';

export interface WebSpeechCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onError?: (message: string) => void;
  onBoundary?: (charIndex: number, charLength: number, totalLength: number) => void;
  onChunkChange?: (current: number, total: number) => void;
}

interface QueuedUtterance {
  utterance: SpeechSynthesisUtterance;
  length: number;
  pauseAfterMs: number;
}

let utteranceQueue: QueuedUtterance[] = [];
let cachedVoices: SpeechSynthesisVoice[] = [];
let currentIndex = 0;
let totalItems = 0;
let paused = false;
let pauseTimer: ReturnType<typeof setTimeout> | null = null;
let callbacks: WebSpeechCallbacks = {};

function preferredVoiceURI(settings: DreamReadSettings, lang: string): string {
  if (lang.startsWith('zh')) {
    return settings.voiceURI_zh || settings.voiceURI;
  }
  return settings.voiceURI_en || settings.voiceURI;
}

function scaledPause(ms: number, rate: number): number {
  if (ms <= 0) return 0;
  return Math.round(ms / Math.max(0.75, rate));
}

function buildQueue(text: string, settings: DreamReadSettings, voices: SpeechSynthesisVoice[]): QueuedUtterance[] {
  const queue: QueuedUtterance[] = [];
  const chunks = splitTextIntoChunks(text);
  const speechRate = Math.min(1.15, Math.max(0.85, settings.rate));

  for (const chunk of chunks) {
    const segments =
      settings.speechLanguage === 'auto'
        ? splitByLanguage(chunk)
        : [{ lang: settings.speechLanguage as 'zh-CN' | 'en-US', text: chunk }];

    for (const segment of segments) {
      const units = splitIntoSpeechUnits(segment.text, segment.lang);
      for (const unit of units) {
        const trimmed = unit.text.trim();
        if (!trimmed) continue;

        const utterance = new SpeechSynthesisUtterance(trimmed);
        utterance.rate = speechRate;
        utterance.pitch = settings.pitch;
        utterance.volume = settings.volume;
        utterance.lang = segment.lang;

        const voice = pickVoiceForLang(voices, segment.lang, preferredVoiceURI(settings, segment.lang));
        if (voice) utterance.voice = voice;

        queue.push({
          utterance,
          length: trimmed.length,
          pauseAfterMs: scaledPause(unit.pauseAfterMs, speechRate),
        });
      }
    }
  }

  return queue;
}

function clearPauseTimer(): void {
  if (pauseTimer !== null) {
    clearTimeout(pauseTimer);
    pauseTimer = null;
  }
}

function speakQueueItem(index: number): void {
  callbacks.onChunkChange?.(index + 1, totalItems);
  speechSynthesis.speak(utteranceQueue[index].utterance);
}

function bindUtterance(item: QueuedUtterance, index: number): void {
  const { utterance, length } = item;

  utterance.onstart = () => {
    if (index === 0) paused = false;
    callbacks.onStart?.();
  };

  utterance.onboundary = (event) => {
    callbacks.onBoundary?.(event.charIndex, event.charLength || 1, length);
  };

  utterance.onend = () => {
    currentIndex += 1;
    if (currentIndex < utteranceQueue.length) {
      const pauseMs = utteranceQueue[index].pauseAfterMs;
      if (pauseMs > 0) {
        pauseTimer = setTimeout(() => {
          pauseTimer = null;
          speakQueueItem(currentIndex);
        }, pauseMs);
      } else {
        speakQueueItem(currentIndex);
      }
      return;
    }
    utteranceQueue = [];
    currentIndex = 0;
    totalItems = 0;
    paused = false;
    callbacks.onEnd?.();
  };

  utterance.onerror = (event) => {
    if (event.error === 'interrupted' || event.error === 'canceled') return;
    callbacks.onError?.(event.error || 'speech synthesis error');
  };
}

export async function speakWithWebSpeech(
  text: string,
  settings: DreamReadSettings,
  cb: WebSpeechCallbacks = {},
): Promise<void> {
  stopWebSpeech(false);
  callbacks = cb;
  cachedVoices = await waitForVoices();
  utteranceQueue = buildQueue(text, settings, cachedVoices);

  if (utteranceQueue.length === 0) return;

  totalItems = utteranceQueue.length;
  currentIndex = 0;

  utteranceQueue.forEach((item, index) => bindUtterance(item, index));
  speakQueueItem(0);
}

export function pauseWebSpeech(): boolean {
  if (speechSynthesis.speaking && !speechSynthesis.paused) {
    clearPauseTimer();
    speechSynthesis.pause();
    paused = true;
    callbacks.onPause?.();
    return true;
  }
  return false;
}

export function resumeWebSpeech(): boolean {
  if (speechSynthesis.paused) {
    speechSynthesis.resume();
    paused = false;
    callbacks.onResume?.();
    return true;
  }
  return false;
}

export function stopWebSpeech(cancelCallbacks = true): void {
  clearPauseTimer();
  speechSynthesis.cancel();
  utteranceQueue = [];
  currentIndex = 0;
  totalItems = 0;
  paused = false;
  if (cancelCallbacks) callbacks = {};
}

export function isWebSpeechPaused(): boolean {
  return paused || speechSynthesis.paused;
}

export function isWebSpeechSpeaking(): boolean {
  return speechSynthesis.speaking || pauseTimer !== null;
}

export function canResumeWebSpeech(): boolean {
  return isWebSpeechPaused() && utteranceQueue.length > 0;
}

export async function preloadVoices(): Promise<SpeechSynthesisVoice[]> {
  cachedVoices = await waitForVoices();
  return cachedVoices;
}

export function getCachedVoices(): SpeechSynthesisVoice[] {
  return cachedVoices.length > 0 ? cachedVoices : speechSynthesis.getVoices();
}

warmUpVoices();

function warmUpVoices(): void {
  void waitForVoices().then((voices) => {
    cachedVoices = voices;
  });
}
