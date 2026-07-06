import type { VoicerSettings } from '../tts/types';
import { getSettings, saveSettings } from '../shared/storage';
import { t, type I18nKey } from '../shared/text-utils';
import {
  pauseWebSpeech,
  resumeWebSpeech,
  speakWithWebSpeech,
  stopWebSpeech,
  isWebSpeechPaused,
  isWebSpeechSpeaking,
} from './web-speech';

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let audio: HTMLAudioElement | null = null;
let blobUrl: string | null = null;
let currentSettings: VoicerSettings | null = null;
let playing = false;
let loading = false;

function label(key: I18nKey): string {
  const lang = currentSettings?.language ?? 'zh-CN';
  return t(lang, key);
}

function render(): void {
  if (!shadow) return;
  shadow.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; }
      .voicer-player {
        position: fixed;
        left: 50%;
        bottom: 24px;
        transform: translateX(-50%);
        z-index: 2147483647;
        width: min(720px, calc(100vw - 32px));
        background: rgba(20, 24, 35, 0.92);
        color: #f5f7fb;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 16px;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(12px);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        padding: 14px 16px;
      }
      .row { display: flex; align-items: center; gap: 12px; }
      .row + .row { margin-top: 10px; }
      .btn {
        border: none;
        background: rgba(255,255,255,0.08);
        color: inherit;
        border-radius: 10px;
        width: 38px;
        height: 38px;
        cursor: pointer;
        font-size: 16px;
      }
      .btn:hover { background: rgba(255,255,255,0.16); }
      .btn.primary { background: #5b7cfa; }
      .btn.primary:hover { background: #4a6ae8; }
      .progress-wrap { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
      .progress {
        width: 100%;
        height: 6px;
        appearance: none;
        background: rgba(255,255,255,0.12);
        border-radius: 999px;
        overflow: hidden;
      }
      .progress::-webkit-slider-thumb {
        appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #5b7cfa;
      }
      .meta { font-size: 12px; opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .notice { font-size: 12px; color: #ffd166; min-height: 16px; }
      .controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .slider-group { display: flex; align-items: center; gap: 6px; font-size: 12px; }
      .slider-group input { width: 90px; }
      .loading {
        width: 18px; height: 18px;
        border: 2px solid rgba(255,255,255,0.2);
        border-top-color: #5b7cfa;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        display: none;
      }
      .loading.show { display: inline-block; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
    <div class="voicer-player">
      <div class="notice" id="notice"></div>
      <div class="row">
        <button class="btn primary" id="playPause" title="${label('play')}">▶</button>
        <button class="btn" id="stop" title="${label('stop')}">■</button>
        <div class="progress-wrap">
          <input class="progress" id="progress" type="range" min="0" max="100" value="0" />
          <div class="meta" id="meta"></div>
        </div>
        <div class="loading" id="loading"></div>
        <button class="btn" id="close" title="${label('close')}">✕</button>
      </div>
      <div class="row controls">
        <label class="slider-group">${label('speed')}
          <input id="rate" type="range" min="0.5" max="2" step="0.1" value="1" />
          <span id="rateValue">1.0x</span>
        </label>
        <label class="slider-group">${label('volume')}
          <input id="volume" type="range" min="0" max="1" step="0.05" value="1" />
        </label>
      </div>
    </div>
  `;

  bindEvents();
  applySettingsToControls();
}

function applySettingsToControls(): void {
  if (!shadow || !currentSettings) return;
  const rate = shadow.getElementById('rate') as HTMLInputElement;
  const volume = shadow.getElementById('volume') as HTMLInputElement;
  const rateValue = shadow.getElementById('rateValue');
  rate.value = String(currentSettings.rate);
  volume.value = String(currentSettings.volume);
  if (rateValue) rateValue.textContent = `${currentSettings.rate.toFixed(1)}x`;
}

function bindEvents(): void {
  if (!shadow) return;

  shadow.getElementById('playPause')?.addEventListener('click', () => void togglePlayPause());
  shadow.getElementById('stop')?.addEventListener('click', () => stopAll());
  shadow.getElementById('close')?.addEventListener('click', () => destroyPlayer());

  shadow.getElementById('rate')?.addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    const rateValue = shadow?.getElementById('rateValue');
    if (rateValue) rateValue.textContent = `${value.toFixed(1)}x`;
    if (currentSettings) {
      currentSettings.rate = value;
      void saveSettings({ rate: value });
      if (playing && audio) audio.playbackRate = value;
    }
  });

  shadow.getElementById('volume')?.addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (currentSettings) {
      currentSettings.volume = value;
      void saveSettings({ volume: value });
      if (audio) audio.volume = value;
    }
  });

  shadow.getElementById('progress')?.addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (audio && audio.duration) {
      audio.currentTime = (value / 100) * audio.duration;
    }
  });
}

function setElementText(id: string, text: string): void {
  const el = shadow?.getElementById(id);
  if (el) el.textContent = text;
}

function setLoadingState(isLoading: boolean): void {
  loading = isLoading;
  shadow?.getElementById('loading')?.classList.toggle('show', isLoading);
}

function setNotice(message: string): void {
  setElementText('notice', message);
}

function setProgress(value: number): void {
  const progress = shadow?.getElementById('progress') as HTMLInputElement | null;
  if (progress) progress.value = String(Math.max(0, Math.min(100, value)));
}

function setPlayingState(isPlaying: boolean): void {
  playing = isPlaying;
  const btn = shadow?.getElementById('playPause');
  if (btn) btn.textContent = isPlaying ? '⏸' : '▶';
}

function setChunkInfo(current: number, total: number): void {
  if (total <= 1) {
    setElementText('meta', '');
    return;
  }
  setElementText('meta', `${label('chunkProgress')} ${current}/${total}`);
}

function ensurePlayer(settings: VoicerSettings): void {
  currentSettings = settings;
  if (host) {
    applySettingsToControls();
    return;
  }
  host = document.createElement('div');
  host.id = 'voicer-extension-root';
  shadow = host.attachShadow({ mode: 'closed' });
  document.documentElement.appendChild(host);
  render();
}

function cleanupAudio(): void {
  if (audio) {
    audio.pause();
    audio.src = '';
    audio = null;
  }
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
    blobUrl = null;
  }
}

export function destroyPlayer(): void {
  stopAll();
  host?.remove();
  host = null;
  shadow = null;
}

export function stopAll(): void {
  stopWebSpeech();
  cleanupAudio();
  setPlayingState(false);
  setLoadingState(false);
  setProgress(0);
  setNotice('');
}

async function togglePlayPause(): Promise<void> {
  if (loading) return;

  if (audio) {
    if (audio.paused) {
      await audio.play();
      setPlayingState(true);
    } else {
      audio.pause();
      setPlayingState(false);
    }
    return;
  }

  if (isWebSpeechSpeaking()) {
    if (isWebSpeechPaused()) {
      resumeWebSpeech();
      setPlayingState(true);
    } else {
      pauseWebSpeech();
      setPlayingState(false);
    }
  }
}

export async function playNative(text: string, settings: VoicerSettings, notice?: string): Promise<void> {
  ensurePlayer(settings);
  cleanupAudio();
  setNotice(notice ?? '');
  setLoadingState(false);
  setPlayingState(true);

  speakWithWebSpeech(text, settings, {
    onBoundary: (charIndex, _charLength, totalLength) => {
      const estimatedProgress = totalLength > 0 ? (charIndex / totalLength) * 100 : 0;
      setProgress(estimatedProgress);
    },
    onEnd: () => {
      setPlayingState(false);
      setProgress(100);
    },
    onError: (message) => {
      setNotice(`${label('error')}: ${message}`);
      setPlayingState(false);
    },
    onPause: () => setPlayingState(false),
    onResume: () => setPlayingState(true),
    onChunkChange: (current, total) => setChunkInfo(current, total),
  });
}

export async function playBlob(
  url: string,
  mimeType: string,
  settings: VoicerSettings,
  notice?: string,
): Promise<void> {
  ensurePlayer(settings);
  stopWebSpeech();
  cleanupAudio();
  setNotice(notice ?? '');
  setLoadingState(false);

  blobUrl = url;
  audio = new Audio(url);
  audio.playbackRate = settings.rate;
  audio.volume = settings.volume;

  audio.addEventListener('timeupdate', () => {
    if (!audio?.duration) return;
    setProgress((audio.currentTime / audio.duration) * 100);
  });

  audio.addEventListener('ended', () => {
    setPlayingState(false);
    setProgress(100);
  });

  audio.addEventListener('pause', () => setPlayingState(false));
  audio.addEventListener('play', () => setPlayingState(true));
  audio.addEventListener('error', () => {
    setNotice(label('error'));
    setPlayingState(false);
  });

  void mimeType;
  await audio.play();
  setPlayingState(true);
}

export function showLoading(settings: VoicerSettings): void {
  ensurePlayer(settings);
  setLoadingState(true);
  setPlayingState(false);
  setProgress(0);
  setNotice(label('loading'));
}
