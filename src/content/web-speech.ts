import type { VoicerSettings } from '../tts/types';
import { splitTextIntoChunks } from '../shared/text-utils';

export interface WebSpeechCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onError?: (message: string) => void;
  onBoundary?: (charIndex: number, charLength: number, totalLength: number) => void;
  onChunkChange?: (current: number, total: number) => void;
}

let utteranceQueue: SpeechSynthesisUtterance[] = [];
let currentChunkIndex = 0;
let totalChunks = 0;
let paused = false;
let callbacks: WebSpeechCallbacks = {};

function pickVoice(voiceURI: string, language: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices();
  if (voiceURI) {
    const matched = voices.find((v) => v.voiceURI === voiceURI || v.name === voiceURI);
    if (matched) return matched;
  }
  return (
    voices.find((v) => v.lang.startsWith(language)) ??
    voices.find((v) => v.lang.startsWith('zh')) ??
    voices[0]
  );
}

function speakChunk(text: string, settings: VoicerSettings): void {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = settings.rate;
  utterance.pitch = settings.pitch;
  utterance.volume = settings.volume;
  utterance.lang = settings.language;

  const voice = pickVoice(settings.voiceURI, settings.language);
  if (voice) utterance.voice = voice;

  const totalLength = text.length;

  utterance.onstart = () => {
    paused = false;
    callbacks.onStart?.();
  };

  utterance.onboundary = (event) => {
    callbacks.onBoundary?.(event.charIndex, event.charLength || 1, totalLength);
  };

  utterance.onend = () => {
    currentChunkIndex += 1;
    if (currentChunkIndex < utteranceQueue.length) {
      callbacks.onChunkChange?.(currentChunkIndex + 1, totalChunks);
      speechSynthesis.speak(utteranceQueue[currentChunkIndex]);
      return;
    }
    utteranceQueue = [];
    currentChunkIndex = 0;
    totalChunks = 0;
    callbacks.onEnd?.();
  };

  utterance.onerror = (event) => {
    if (event.error === 'interrupted' || event.error === 'canceled') return;
    callbacks.onError?.(event.error || 'speech synthesis error');
  };

  utteranceQueue.push(utterance);
}

export function speakWithWebSpeech(
  text: string,
  settings: VoicerSettings,
  cb: WebSpeechCallbacks = {},
): void {
  stopWebSpeech();
  callbacks = cb;

  const chunks = splitTextIntoChunks(text);
  if (chunks.length === 0) return;

  totalChunks = chunks.length;
  currentChunkIndex = 0;
  utteranceQueue = [];

  for (const chunk of chunks) {
    speakChunk(chunk, settings);
  }

  callbacks.onChunkChange?.(1, totalChunks);
  speechSynthesis.speak(utteranceQueue[0]);
}

export function pauseWebSpeech(): void {
  if (speechSynthesis.speaking && !speechSynthesis.paused) {
    speechSynthesis.pause();
    paused = true;
    callbacks.onPause?.();
  }
}

export function resumeWebSpeech(): void {
  if (speechSynthesis.paused) {
    speechSynthesis.resume();
    paused = false;
    callbacks.onResume?.();
  }
}

export function stopWebSpeech(): void {
  speechSynthesis.cancel();
  utteranceQueue = [];
  currentChunkIndex = 0;
  totalChunks = 0;
  paused = false;
}

export function isWebSpeechPaused(): boolean {
  return paused || speechSynthesis.paused;
}

export function isWebSpeechSpeaking(): boolean {
  return speechSynthesis.speaking;
}

export function getWebSpeechVoices(): SpeechSynthesisVoice[] {
  return speechSynthesis.getVoices();
}

export function warmUpVoices(): void {
  void getWebSpeechVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = () => getWebSpeechVoices();
  }
}

warmUpVoices();
