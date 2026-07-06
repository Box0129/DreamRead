import type { DreamReadSettings } from '../tts/types';
import { splitByLanguage, splitTextIntoChunks } from '../shared/text-utils';

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
}

let utteranceQueue: QueuedUtterance[] = [];
let currentIndex = 0;
let totalItems = 0;
let paused = false;
let callbacks: WebSpeechCallbacks = {};

function pickVoice(voiceURI: string, speechLang: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices();
  if (voiceURI) {
    const matched = voices.find((v) => v.voiceURI === voiceURI || v.name === voiceURI);
    if (matched && matched.lang.startsWith(speechLang.slice(0, 2))) return matched;
  }
  return (
    voices.find((v) => v.lang.startsWith(speechLang)) ??
    voices.find((v) => v.lang.startsWith(speechLang.slice(0, 2))) ??
    voices[0]
  );
}

function buildQueue(text: string, settings: DreamReadSettings): QueuedUtterance[] {
  const queue: QueuedUtterance[] = [];
  const chunks = splitTextIntoChunks(text);

  for (const chunk of chunks) {
    const segments =
      settings.speechLanguage === 'auto'
        ? splitByLanguage(chunk)
        : [{ lang: settings.speechLanguage, text: chunk }];

    for (const segment of segments) {
      const trimmed = segment.text.trim();
      if (!trimmed) continue;

      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.rate = settings.rate;
      utterance.pitch = settings.pitch;
      utterance.volume = settings.volume;
      utterance.lang = segment.lang;

      const voice = pickVoice(settings.voiceURI, segment.lang);
      if (voice) utterance.voice = voice;

      queue.push({ utterance, length: trimmed.length });
    }
  }

  return queue;
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
      callbacks.onChunkChange?.(currentIndex + 1, totalItems);
      speechSynthesis.speak(utteranceQueue[currentIndex].utterance);
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

export function speakWithWebSpeech(
  text: string,
  settings: DreamReadSettings,
  cb: WebSpeechCallbacks = {},
): void {
  stopWebSpeech(false);
  callbacks = cb;
  utteranceQueue = buildQueue(text, settings);

  if (utteranceQueue.length === 0) return;

  totalItems = utteranceQueue.length;
  currentIndex = 0;

  utteranceQueue.forEach((item, index) => bindUtterance(item, index));
  callbacks.onChunkChange?.(1, totalItems);
  speechSynthesis.speak(utteranceQueue[0].utterance);
}

export function pauseWebSpeech(): boolean {
  if (speechSynthesis.speaking && !speechSynthesis.paused) {
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
  return speechSynthesis.speaking;
}

export function canResumeWebSpeech(): boolean {
  return isWebSpeechPaused() && utteranceQueue.length > 0;
}

export function hasWebSpeechQueue(): boolean {
  return utteranceQueue.length > 0;
}

export function warmUpVoices(): void {
  void speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}

warmUpVoices();
