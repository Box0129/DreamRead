import type { DreamReadSettings, PlayerTheme } from '../tts/types';
import { getSettings, onSettingsChanged, saveSettings } from '../shared/storage';
import { t, type I18nKey } from '../shared/text-utils';
import {
  pauseWebSpeech,
  resumeWebSpeech,
  speakWithWebSpeech,
  stopWebSpeech,
  isWebSpeechPaused,
  isWebSpeechSpeaking,
  canResumeWebSpeech,
} from './web-speech';

interface PlaybackSession {
  text: string;
  settings: DreamReadSettings;
  mode: 'native' | 'blob';
  blobUrl?: string;
  mimeType?: string;
}

const THEME_STYLES: Record<
  PlayerTheme,
  { accent: string; accent2: string; text: string; border: string; glow: string }
> = {
  candy: {
    accent: '#ff6b9d',
    accent2: '#ffb347',
    text: '#4a1942',
    border: 'rgba(255, 107, 157, 0.45)',
    glow: 'rgba(255, 107, 157, 0.35)',
  },
  ocean: {
    accent: '#3b82f6',
    accent2: '#06b6d4',
    text: '#0c2340',
    border: 'rgba(59, 130, 246, 0.45)',
    glow: 'rgba(59, 130, 246, 0.35)',
  },
  forest: {
    accent: '#22c55e',
    accent2: '#84cc16',
    text: '#14532d',
    border: 'rgba(34, 197, 94, 0.45)',
    glow: 'rgba(34, 197, 94, 0.35)',
  },
  night: {
    accent: '#a78bfa',
    accent2: '#60a5fa',
    text: '#eef2ff',
    border: 'rgba(167, 139, 250, 0.4)',
    glow: 'rgba(167, 139, 250, 0.35)',
  },
};

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let audio: HTMLAudioElement | null = null;
let session: PlaybackSession | null = null;
let currentSettings: DreamReadSettings | null = null;
let playing = false;
let loading = false;
let finished = false;
let settingsOpen = false;
let detachSettingsListener: (() => void) | null = null;

function label(key: I18nKey): string {
  const lang = currentSettings?.language ?? 'zh-CN';
  return t(lang, key);
}

function themeLabel(theme: PlayerTheme): string {
  const map: Record<PlayerTheme, I18nKey> = {
    candy: 'themeCandy',
    ocean: 'themeOcean',
    forest: 'themeForest',
    night: 'themeNight',
  };
  return label(map[theme]);
}

function applyThemeVars(): void {
  if (!shadow || !currentSettings) return;
  const theme = THEME_STYLES[currentSettings.playerTheme];
  const opacity = Math.max(0.25, Math.min(1, currentSettings.playerOpacity));
  const player = shadow.querySelector('.dreamread-player') as HTMLElement | null;
  if (!player) return;

  player.style.setProperty('--accent', theme.accent);
  player.style.setProperty('--accent2', theme.accent2);
  player.style.setProperty('--text', theme.text);
  player.style.setProperty('--border', theme.border);
  player.style.setProperty('--glow', theme.glow);
  player.style.setProperty('--panel-opacity', String(opacity));
  player.dataset.theme = currentSettings.playerTheme;
}

function render(): void {
  if (!shadow) return;

  shadow.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; }
      .dreamread-player {
        --panel-opacity: 0.72;
        position: fixed;
        left: 50%;
        bottom: 16px;
        transform: translateX(-50%);
        z-index: 2147483647;
        width: min(560px, calc(100vw - 24px));
        background: rgba(255, 255, 255, var(--panel-opacity));
        color: var(--text);
        border: 2px solid var(--border);
        border-radius: 22px;
        box-shadow: 0 8px 28px var(--glow);
        backdrop-filter: blur(14px) saturate(1.2);
        font-family: "Segoe UI", "PingFang SC", sans-serif;
        padding: 10px 12px;
        transition: background 0.2s ease;
      }
      .dreamread-player[data-theme="night"] {
        background: rgba(15, 23, 42, var(--panel-opacity));
      }
      .row { display: flex; align-items: center; gap: 8px; }
      .row + .row { margin-top: 8px; }
      .btn {
        border: none;
        background: linear-gradient(145deg, var(--accent), var(--accent2));
        color: #fff;
        border-radius: 50%;
        width: 34px;
        height: 34px;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        box-shadow: 0 3px 8px var(--glow);
        flex-shrink: 0;
      }
      .btn.secondary {
        background: rgba(255,255,255,0.55);
        color: var(--text);
        box-shadow: none;
        border: 1.5px solid var(--border);
      }
      .dreamread-player[data-theme="night"] .btn.secondary {
        background: rgba(255,255,255,0.12);
        color: #eef2ff;
      }
      .btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .btn:not(:disabled):hover { filter: brightness(1.06); transform: translateY(-1px); }
      .progress-wrap { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .progress {
        width: 100%;
        height: 5px;
        appearance: none;
        background: rgba(0,0,0,0.08);
        border-radius: 999px;
      }
      .progress::-webkit-slider-thumb {
        appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--accent);
      }
      .meta { font-size: 11px; opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .notice { font-size: 11px; color: var(--accent); min-height: 14px; margin-bottom: 4px; }
      .panel {
        display: none;
        padding-top: 6px;
        border-top: 1.5px dashed var(--border);
        gap: 8px;
        flex-direction: column;
      }
      .panel.open { display: flex; }
      .slider-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        flex-wrap: wrap;
      }
      .slider-row input[type="range"] { flex: 1; min-width: 80px; }
      .slider-row select {
        flex: 1;
        border-radius: 10px;
        border: 1.5px solid var(--border);
        background: rgba(255,255,255,0.45);
        padding: 4px 8px;
        color: inherit;
        font-size: 11px;
      }
      .link-btn {
        border: none;
        background: transparent;
        color: var(--accent);
        cursor: pointer;
        font-size: 11px;
        text-decoration: underline;
        padding: 0;
      }
      .loading {
        width: 16px; height: 16px;
        border: 2px solid rgba(0,0,0,0.12);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        display: none;
        flex-shrink: 0;
      }
      .loading.show { display: inline-block; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
    <div class="dreamread-player" data-theme="candy">
      <div class="notice" id="notice"></div>
      <div class="row">
        <button class="btn" id="play" title="${label('play')}">▶</button>
        <button class="btn secondary" id="pause" title="${label('pause')}">⏸</button>
        <button class="btn secondary" id="stop" title="${label('stop')}">■</button>
        <div class="progress-wrap">
          <input class="progress" id="progress" type="range" min="0" max="100" value="0" />
          <div class="meta" id="meta"></div>
        </div>
        <div class="loading" id="loading"></div>
        <button class="btn secondary" id="settings" title="${label('settings')}">⚙</button>
        <button class="btn secondary" id="close" title="${label('close')}">✕</button>
      </div>
      <div class="panel" id="panel">
        <label class="slider-row">${label('speed')}
          <input id="rate" type="range" min="0.5" max="2" step="0.1" />
          <span id="rateValue">1.0x</span>
        </label>
        <label class="slider-row">${label('volume')}
          <input id="volume" type="range" min="0" max="1" step="0.05" />
        </label>
        <label class="slider-row">${label('opacity')}
          <input id="opacity" type="range" min="0.25" max="1" step="0.05" />
        </label>
        <label class="slider-row">${label('theme')}
          <select id="theme">
            <option value="candy">${themeLabel('candy')}</option>
            <option value="ocean">${themeLabel('ocean')}</option>
            <option value="forest">${themeLabel('forest')}</option>
            <option value="night">${themeLabel('night')}</option>
          </select>
        </label>
        <button class="link-btn" id="openOptions" type="button">${label('openOptions')}</button>
      </div>
    </div>
  `;

  bindEvents();
  applySettingsToControls();
  applyThemeVars();
}

function applySettingsToControls(): void {
  if (!shadow || !currentSettings) return;
  (shadow.getElementById('rate') as HTMLInputElement).value = String(currentSettings.rate);
  (shadow.getElementById('volume') as HTMLInputElement).value = String(currentSettings.volume);
  (shadow.getElementById('opacity') as HTMLInputElement).value = String(currentSettings.playerOpacity);
  (shadow.getElementById('theme') as HTMLSelectElement).value = currentSettings.playerTheme;
  const rateValue = shadow.getElementById('rateValue');
  if (rateValue) rateValue.textContent = `${currentSettings.rate.toFixed(1)}x`;
  shadow.getElementById('panel')?.classList.toggle('open', settingsOpen);
}

function bindEvents(): void {
  if (!shadow) return;

  shadow.getElementById('play')?.addEventListener('click', () => void handlePlay());
  shadow.getElementById('pause')?.addEventListener('click', () => handlePause());
  shadow.getElementById('stop')?.addEventListener('click', () => handleStop());
  shadow.getElementById('close')?.addEventListener('click', () => destroyPlayer());
  shadow.getElementById('settings')?.addEventListener('click', () => toggleSettingsPanel());
  shadow.getElementById('openOptions')?.addEventListener('click', () => chrome.runtime.openOptionsPage());

  shadow.getElementById('rate')?.addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    shadow!.getElementById('rateValue')!.textContent = `${value.toFixed(1)}x`;
    if (!currentSettings) return;
    currentSettings.rate = value;
    void saveSettings({ rate: value });
    if (audio) audio.playbackRate = value;
  });

  shadow.getElementById('volume')?.addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (!currentSettings) return;
    currentSettings.volume = value;
    void saveSettings({ volume: value });
    if (audio) audio.volume = value;
  });

  shadow.getElementById('opacity')?.addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (!currentSettings) return;
    currentSettings.playerOpacity = value;
    void saveSettings({ playerOpacity: value });
    applyThemeVars();
  });

  shadow.getElementById('theme')?.addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value as PlayerTheme;
    if (!currentSettings) return;
    currentSettings.playerTheme = value;
    void saveSettings({ playerTheme: value });
    applyThemeVars();
  });

  shadow.getElementById('progress')?.addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (audio && audio.duration) {
      audio.currentTime = (value / 100) * audio.duration;
    }
  });
}

function toggleSettingsPanel(): void {
  settingsOpen = !settingsOpen;
  shadow?.getElementById('panel')?.classList.toggle('open', settingsOpen);
}

function setElementText(id: string, text: string): void {
  shadow?.getElementById(id) && (shadow.getElementById(id)!.textContent = text);
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
}

function setChunkInfo(current: number, total: number): void {
  if (total <= 1) {
    setElementText('meta', '');
    return;
  }
  setElementText('meta', `${label('chunkProgress')} ${current}/${total}`);
}

function ensurePlayer(settings: DreamReadSettings): void {
  currentSettings = settings;
  if (host) {
    applySettingsToControls();
    applyThemeVars();
    return;
  }
  host = document.createElement('div');
  host.id = 'dreamread-extension-root';
  shadow = host.attachShadow({ mode: 'closed' });
  document.documentElement.appendChild(host);
  render();
  detachSettingsListener = onSettingsChanged((next) => {
    currentSettings = next;
    applySettingsToControls();
    applyThemeVars();
  });
}

function cleanupAudio(): void {
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    audio = null;
  }
}

function attachBlobAudio(url: string, settings: DreamReadSettings): void {
  cleanupAudio();
  audio = new Audio(url);
  audio.playbackRate = settings.rate;
  audio.volume = settings.volume;

  audio.addEventListener('timeupdate', () => {
    if (!audio?.duration) return;
    setProgress((audio.currentTime / audio.duration) * 100);
  });

  audio.addEventListener('ended', () => {
    playing = false;
    finished = true;
    setPlayingState(false);
    setProgress(100);
  });

  audio.addEventListener('pause', () => {
    if (audio?.ended) return;
    playing = false;
    setPlayingState(false);
  });

  audio.addEventListener('play', () => {
    playing = true;
    finished = false;
    setPlayingState(true);
  });

  audio.addEventListener('error', () => {
    setNotice(label('error'));
    playing = false;
    setPlayingState(false);
  });
}

async function startNativePlayback(text: string, settings: DreamReadSettings, notice?: string): Promise<void> {
  setNotice(notice ?? '');
  setLoadingState(false);
  finished = false;
  playing = true;
  setPlayingState(true);
  setProgress(0);

  speakWithWebSpeech(text, settings, {
    onBoundary: (charIndex, _charLength, totalLength) => {
      setProgress(totalLength > 0 ? (charIndex / totalLength) * 100 : 0);
    },
    onEnd: () => {
      playing = false;
      finished = true;
      setPlayingState(false);
      setProgress(100);
    },
    onError: (message) => {
      setNotice(`${label('error')}: ${message}`);
      playing = false;
      setPlayingState(false);
    },
    onPause: () => {
      playing = false;
      setPlayingState(false);
    },
    onResume: () => {
      playing = true;
      setPlayingState(true);
    },
    onChunkChange: (current, total) => setChunkInfo(current, total),
  });
}

async function startBlobPlayback(url: string, mimeType: string, settings: DreamReadSettings, notice?: string): Promise<void> {
  stopWebSpeech();
  attachBlobAudio(url, settings);
  setNotice(notice ?? '');
  setLoadingState(false);
  finished = false;
  void mimeType;
  await audio!.play();
}

async function handlePlay(): Promise<void> {
  if (loading || !session) return;

  if (session.mode === 'blob' && audio) {
    if (finished || audio.ended) {
      audio.currentTime = 0;
      finished = false;
      await audio.play();
      return;
    }
    if (audio.paused) {
      await audio.play();
    }
    return;
  }

  if (canResumeWebSpeech()) {
    resumeWebSpeech();
    return;
  }

  if (isWebSpeechSpeaking() && !isWebSpeechPaused()) return;

  await startNativePlayback(session.text, session.settings);
}

function handlePause(): void {
  if (loading) return;

  if (session?.mode === 'blob' && audio && !audio.paused && !audio.ended) {
    audio.pause();
    return;
  }

  pauseWebSpeech();
}

function handleStop(): void {
  if (session?.mode === 'blob' && audio) {
    audio.pause();
    audio.currentTime = 0;
  } else {
    stopWebSpeech();
  }
  playing = false;
  finished = false;
  setPlayingState(false);
  setProgress(0);
}

export function destroyPlayer(): void {
  stopWebSpeech();
  cleanupAudio();
  session = null;
  playing = false;
  finished = false;
  loading = false;
  settingsOpen = false;
  detachSettingsListener?.();
  detachSettingsListener = null;
  host?.remove();
  host = null;
  shadow = null;
}

export function stopAll(): void {
  handleStop();
  setNotice('');
  setLoadingState(false);
}

export async function playNative(text: string, settings: DreamReadSettings, notice?: string): Promise<void> {
  ensurePlayer(settings);
  cleanupAudio();
  stopWebSpeech();
  session = { text, settings, mode: 'native' };
  await startNativePlayback(text, settings, notice);
}

export async function playBlob(
  url: string,
  mimeType: string,
  settings: DreamReadSettings,
  notice?: string,
): Promise<void> {
  ensurePlayer(settings);
  stopWebSpeech();
  session = { text: '', settings, mode: 'blob', blobUrl: url, mimeType };
  await startBlobPlayback(url, mimeType, settings, notice);
}

export function showLoading(settings: DreamReadSettings): void {
  ensurePlayer(settings);
  setLoadingState(true);
  playing = false;
  finished = false;
  setPlayingState(false);
  setProgress(0);
  setNotice(label('loading'));
}

export function setSessionText(text: string, settings: DreamReadSettings): void {
  session = { text, settings, mode: 'native' };
}
