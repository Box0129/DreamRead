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
  preloadVoices,
} from './web-speech';
import {
  filterVoicesByLang,
  sortVoicesByQuality,
  voiceOptionLabel,
  defaultVoiceURI,
} from '../shared/voices';

interface PlaybackSession {
  text: string;
  settings: DreamReadSettings;
  mode: 'native' | 'blob';
  blobUrl?: string;
  mimeType?: string;
}

const THEME_STYLES: Record<
  PlayerTheme,
  { accent: string; accent2: string; text: string; border: string; glow: string; bg: string; bgNight: string }
> = {
  candy: {
    accent: '#ff6b9d',
    accent2: '#ffb347',
    text: '#4a1942',
    border: 'rgba(255, 107, 157, 0.45)',
    glow: 'rgba(255, 107, 157, 0.35)',
    bg: '255, 255, 255',
    bgNight: '15, 23, 42',
  },
  ocean: {
    accent: '#3b82f6',
    accent2: '#06b6d4',
    text: '#0c2340',
    border: 'rgba(59, 130, 246, 0.45)',
    glow: 'rgba(59, 130, 246, 0.35)',
    bg: '255, 255, 255',
    bgNight: '15, 23, 42',
  },
  forest: {
    accent: '#22c55e',
    accent2: '#84cc16',
    text: '#14532d',
    border: 'rgba(34, 197, 94, 0.45)',
    glow: 'rgba(34, 197, 94, 0.35)',
    bg: '255, 255, 255',
    bgNight: '15, 23, 42',
  },
  night: {
    accent: '#a78bfa',
    accent2: '#60a5fa',
    text: '#eef2ff',
    border: 'rgba(167, 139, 250, 0.4)',
    glow: 'rgba(167, 139, 250, 0.35)',
    bg: '255, 255, 255',
    bgNight: '15, 23, 42',
  },
};

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let audio: HTMLAudioElement | null = null;
let activeBlobUrl: string | null = null;
let session: PlaybackSession | null = null;
let currentSettings: DreamReadSettings | null = null;
let playing = false;
let loading = false;
let finished = false;
let settingsOpen = false;
let loopEnabled = false;
let isScrubbingProgress = false;
let nativeProgressTimer: ReturnType<typeof setInterval> | null = null;
let nativeProgress: {
  totalChars: number;
  rate: number;
  chunkCurrent: number;
  chunkTotal: number;
  segmentChars: number;
  boundaryChars: number;
  startedAt: number;
  pausedAccum: number;
  pauseStartedAt: number;
} | null = null;
let detachSettingsListener: (() => void) | null = null;
let dragState: { startX: number; startY: number; originX: number; originY: number } | null = null;
let useCustomPosition = false;

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

function clampOpacity(value: number): number {
  return Math.max(0.05, Math.min(1, value));
}

function applyThemeVars(): void {
  if (!shadow || !currentSettings) return;
  const theme = THEME_STYLES[currentSettings.playerTheme];
  const opacity = clampOpacity(currentSettings.playerOpacity);
  const player = shadow.querySelector('.dreamread-player') as HTMLElement | null;
  if (!player) return;

  const isNight = currentSettings.playerTheme === 'night';
  const rgb = isNight ? theme.bgNight : theme.bg;
  const blur = opacity < 0.2 ? 0 : Math.round(12 * opacity);

  player.style.setProperty('--accent', theme.accent);
  player.style.setProperty('--accent2', theme.accent2);
  player.style.setProperty('--text', theme.text);
  player.style.setProperty('--border', theme.border);
  player.style.setProperty('--glow', theme.glow);
  player.style.setProperty('--panel-opacity', String(opacity));
  player.style.setProperty('--panel-bg', `rgba(${rgb}, ${opacity * 0.55})`);
  player.style.setProperty('--btn-secondary-bg', `rgba(${rgb}, ${opacity * 0.35})`);
  player.style.setProperty('--track-bg', `rgba(0, 0, 0, ${0.08 + (1 - opacity) * 0.04})`);
  player.style.setProperty('--backdrop-blur', `${blur}px`);
  player.dataset.theme = currentSettings.playerTheme;

  applyPlayerPosition();
  updateLoopButton();
}

function applyPlayerPosition(): void {
  if (!shadow || !currentSettings) return;
  const player = shadow.querySelector('.dreamread-player') as HTMLElement | null;
  if (!player) return;

  if (useCustomPosition || currentSettings.playerPosY >= 0) {
    player.style.left = `${currentSettings.playerPosX}%`;
    player.style.top = `${currentSettings.playerPosY}px`;
    player.style.bottom = 'auto';
    player.style.transform = 'translateX(-50%)';
    useCustomPosition = true;
    return;
  }

  player.style.left = '50%';
  player.style.bottom = '16px';
  player.style.top = 'auto';
  player.style.transform = 'translateX(-50%)';
}

function render(): void {
  if (!shadow) return;

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;
      }
      .dreamread-player {
        --panel-opacity: 0.72;
        --panel-bg: rgba(255, 255, 255, 0.4);
        --btn-secondary-bg: rgba(255, 255, 255, 0.25);
        --track-bg: rgba(0, 0, 0, 0.1);
        --backdrop-blur: 8px;
        position: fixed;
        left: 50%;
        bottom: 16px;
        transform: translateX(-50%);
        pointer-events: auto;
        width: min(540px, calc(100vw - 24px));
        background: var(--panel-bg);
        color: var(--text);
        border: 2px solid var(--border);
        border-radius: 20px;
        box-shadow: 0 6px 24px var(--glow);
        backdrop-filter: blur(var(--backdrop-blur)) saturate(1.1);
        font-family: "Segoe UI", "PingFang SC", sans-serif;
        padding: 8px 10px 10px;
        user-select: none;
        touch-action: none;
      }
      .player-header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
        cursor: grab;
        padding: 2px 4px;
        border-radius: 10px;
      }
      .player-header:active { cursor: grabbing; }
      .drag-grip {
        font-size: 12px;
        opacity: 0.55;
        letter-spacing: 1px;
        flex-shrink: 0;
      }
      .row { display: flex; align-items: center; gap: 8px; }
      .row + .row { margin-top: 8px; }
      .btn {
        border: none;
        background: linear-gradient(145deg, var(--accent), var(--accent2));
        color: #fff;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        cursor: pointer;
        font-size: 13px;
        line-height: 1;
        box-shadow: 0 2px 6px var(--glow);
        flex-shrink: 0;
        pointer-events: auto;
      }
      .btn.secondary {
        background: var(--btn-secondary-bg);
        color: var(--text);
        box-shadow: none;
        border: 1.5px solid var(--border);
      }
      .btn.active {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
      }
      .btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .btn:not(:disabled):hover { filter: brightness(1.06); }
      .progress-wrap { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .range {
        width: 100%;
        height: 22px;
        margin: 0;
        padding: 0;
        cursor: pointer;
        pointer-events: auto;
        touch-action: none;
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
      }
      .range:focus { outline: none; }
      .range::-webkit-slider-runnable-track {
        height: 6px;
        border-radius: 999px;
        background: var(--track-bg);
      }
      .range::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 16px;
        height: 16px;
        margin-top: -5px;
        border-radius: 50%;
        background: var(--accent);
        border: 2px solid #fff;
        box-shadow: 0 1px 4px rgba(0,0,0,0.25);
        cursor: grab;
      }
      .range::-moz-range-track {
        height: 6px;
        border-radius: 999px;
        background: var(--track-bg);
        border: none;
      }
      .range::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--accent);
        border: 2px solid #fff;
        cursor: grab;
      }
      .meta { font-size: 11px; opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .notice { font-size: 11px; color: var(--accent); flex: 1; min-height: 14px; }
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
      }
      .slider-row .range { flex: 1; min-width: 60px; }
      .slider-row select {
        flex: 1;
        border-radius: 10px;
        border: 1.5px solid var(--border);
        background: var(--btn-secondary-bg);
        padding: 4px 8px;
        color: inherit;
        font-size: 11px;
        pointer-events: auto;
      }
      .link-btn {
        border: none;
        background: transparent;
        color: var(--accent);
        cursor: pointer;
        font-size: 11px;
        text-decoration: underline;
        padding: 4px 0;
        pointer-events: auto;
        text-align: left;
      }
      .hint-voice { font-size: 10px; opacity: 0.7; margin: 0; pointer-events: none; }
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
      <div class="player-header" id="dragHandle" title="${label('dragHint')}">
        <span class="drag-grip">⋮⋮</span>
        <div class="notice" id="notice"></div>
      </div>
      <div class="row">
        <button class="btn" id="play" title="${label('play')}">▶</button>
        <button class="btn secondary" id="pause" title="${label('pause')}">⏸</button>
        <button class="btn secondary" id="stop" title="${label('stop')}">■</button>
        <button class="btn secondary" id="loop" title="${label('loop')}">🔁</button>
        <div class="progress-wrap">
          <input class="range progress" id="progress" type="range" min="0" max="100" value="0" />
          <div class="meta" id="meta"></div>
        </div>
        <div class="loading" id="loading"></div>
        <button class="btn secondary" id="settings" title="${label('settings')}">⚙</button>
        <button class="btn secondary" id="close" title="${label('close')}">✕</button>
      </div>
      <div class="panel" id="panel">
        <label class="slider-row">${label('speed')}
          <input class="range" id="rate" type="range" min="0.5" max="2" step="0.1" />
          <span id="rateValue">1.0x</span>
        </label>
        <label class="slider-row">${label('volume')}
          <input class="range" id="volume" type="range" min="0" max="1" step="0.05" />
        </label>
        <label class="slider-row">${label('opacity')}
          <input class="range" id="opacity" type="range" min="0.05" max="1" step="0.05" />
        </label>
        <label class="slider-row">${label('voiceZh')}
          <select id="voiceZh"></select>
        </label>
        <label class="slider-row">${label('voiceEn')}
          <select id="voiceEn"></select>
        </label>
        <p class="hint-voice">${label('voiceNaturalHint')}</p>
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
  void populateVoiceSelects();
}

async function populateVoiceSelects(): Promise<void> {
  if (!shadow || !currentSettings) return;
  const voices = await preloadVoices();
  const zhSelect = shadow.getElementById('voiceZh') as HTMLSelectElement | null;
  const enSelect = shadow.getElementById('voiceEn') as HTMLSelectElement | null;
  if (!zhSelect || !enSelect) return;

  const fill = (select: HTMLSelectElement, lang: string, selected: string) => {
    select.innerHTML = '';
    for (const voice of sortVoicesByQuality(filterVoicesByLang(voices, lang))) {
      const option = document.createElement('option');
      option.value = voice.voiceURI;
      option.textContent = voiceOptionLabel(voice);
      select.appendChild(option);
    }
    if (selected && [...select.options].some((o) => o.value === selected)) {
      select.value = selected;
    } else {
      const fallback = defaultVoiceURI(voices, lang);
      if (fallback) select.value = fallback;
    }
  };

  fill(zhSelect, 'zh-CN', currentSettings.voiceURI_zh || currentSettings.voiceURI);
  fill(enSelect, 'en-US', currentSettings.voiceURI_en || currentSettings.voiceURI);
}

function openAdvancedSettings(): void {
  void chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }).catch(() => {
    const url = chrome.runtime.getURL('src/options/index.html');
    window.open(url, '_blank', 'noopener,noreferrer');
  });
}

function bindProgressScrubGuard(): void {
  const el = shadow?.getElementById('progress');
  if (!el) return;
  el.addEventListener('pointerdown', () => {
    isScrubbingProgress = true;
  });
  const release = () => {
    isScrubbingProgress = false;
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);
  window.addEventListener('pointerup', release);
}

function stopNativeProgressTracker(): void {
  if (nativeProgressTimer !== null) {
    clearInterval(nativeProgressTimer);
    nativeProgressTimer = null;
  }
  nativeProgress = null;
}

function estimateSpeechMs(charCount: number, rate: number): number {
  const msPerChar = 95 / Math.max(0.5, Math.min(2, rate));
  return Math.max(charCount * msPerChar, 800);
}

function tickNativeProgress(): void {
  if (!nativeProgress || isScrubbingProgress || !playing) return;

  if (isWebSpeechPaused()) {
    if (!nativeProgress.pauseStartedAt) nativeProgress.pauseStartedAt = performance.now();
    return;
  }

  if (nativeProgress.pauseStartedAt) {
    nativeProgress.pausedAccum += performance.now() - nativeProgress.pauseStartedAt;
    nativeProgress.pauseStartedAt = 0;
  }

  const {
    totalChars,
    rate,
    chunkCurrent,
    chunkTotal,
    segmentChars,
    boundaryChars,
    startedAt,
    pausedAccum,
  } = nativeProgress;

  const totalMs = estimateSpeechMs(totalChars, rate);
  const elapsed = performance.now() - startedAt - pausedAccum;
  const timeRatio = Math.min(1, elapsed / totalMs);

  let segmentRatio = segmentChars > 0 ? boundaryChars / segmentChars : 0;
  if (segmentRatio <= 0) {
    const chunkWeight = 1 / Math.max(1, chunkTotal);
    segmentRatio = Math.min(1, Math.max(0, (timeRatio - (chunkCurrent - 1) * chunkWeight) / chunkWeight));
  }

  const overall = ((chunkCurrent - 1 + segmentRatio) / Math.max(1, chunkTotal)) * 100;
  setProgress(Math.min(99, overall));
}

function startNativeProgressTracker(text: string, rate: number): void {
  stopNativeProgressTracker();
  nativeProgress = {
    totalChars: Math.max(text.length, 1),
    rate,
    chunkCurrent: 1,
    chunkTotal: 1,
    segmentChars: Math.max(text.length, 1),
    boundaryChars: 0,
    startedAt: performance.now(),
    pausedAccum: 0,
    pauseStartedAt: 0,
  };
  nativeProgressTimer = setInterval(tickNativeProgress, 120);
}

function applySettingsToControls(): void {
  if (!shadow || !currentSettings) return;
  (shadow.getElementById('rate') as HTMLInputElement).value = String(currentSettings.rate);
  (shadow.getElementById('volume') as HTMLInputElement).value = String(currentSettings.volume);
  (shadow.getElementById('opacity') as HTMLInputElement).value = String(currentSettings.playerOpacity);
  (shadow.getElementById('theme') as HTMLSelectElement).value = currentSettings.playerTheme;
  loopEnabled = currentSettings.loopPlayback;
  const rateValue = shadow.getElementById('rateValue');
  if (rateValue) rateValue.textContent = `${currentSettings.rate.toFixed(1)}x`;
  shadow.getElementById('panel')?.classList.toggle('open', settingsOpen);
  useCustomPosition = currentSettings.playerPosY >= 0;
}

function bindDrag(): void {
  const handle = shadow?.getElementById('dragHandle');
  const player = shadow?.querySelector('.dreamread-player') as HTMLElement | null;
  if (!handle || !player) return;

  handle.addEventListener('pointerdown', (event) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const rect = player.getBoundingClientRect();
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left + rect.width / 2,
      originY: rect.top,
    };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  handle.addEventListener('pointermove', (event) => {
    if (!dragState || !currentSettings) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    const centerX = dragState.originX + dx;
    const topY = dragState.originY + dy;
    const posX = (centerX / window.innerWidth) * 100;
    const clampedX = Math.max(8, Math.min(92, posX));
    const clampedY = Math.max(8, Math.min(window.innerHeight - 60, topY));

    player.style.left = `${clampedX}%`;
    player.style.top = `${clampedY}px`;
    player.style.bottom = 'auto';
    player.style.transform = 'translateX(-50%)';
    useCustomPosition = true;
  });

  handle.addEventListener('pointerup', (event) => {
    if (!dragState || !currentSettings) return;
    const rect = player.getBoundingClientRect();
    const posX = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
    const posY = rect.top;
    currentSettings.playerPosX = Math.round(posX * 10) / 10;
    currentSettings.playerPosY = Math.round(posY);
    void saveSettings({ playerPosX: currentSettings.playerPosX, playerPosY: currentSettings.playerPosY });
    dragState = null;
    handle.releasePointerCapture(event.pointerId);
  });
}

function bindEvents(): void {
  if (!shadow) return;

  shadow.getElementById('play')?.addEventListener('click', () => void handlePlay());
  shadow.getElementById('pause')?.addEventListener('click', () => handlePause());
  shadow.getElementById('stop')?.addEventListener('click', () => handleStop());
  shadow.getElementById('loop')?.addEventListener('click', () => toggleLoop());
  shadow.getElementById('close')?.addEventListener('click', () => destroyPlayer());
  shadow.getElementById('settings')?.addEventListener('click', () => toggleSettingsPanel());
  shadow.getElementById('openOptions')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openAdvancedSettings();
  });

  bindProgressScrubGuard();
  bindDrag();

  shadow.getElementById('rate')?.addEventListener('input', (event) => {
    event.stopPropagation();
    const value = Number((event.target as HTMLInputElement).value);
    shadow!.getElementById('rateValue')!.textContent = `${value.toFixed(1)}x`;
    if (!currentSettings) return;
    currentSettings.rate = value;
    void saveSettings({ rate: value });
    if (audio) audio.playbackRate = value;
  });

  shadow.getElementById('volume')?.addEventListener('input', (event) => {
    event.stopPropagation();
    const value = Number((event.target as HTMLInputElement).value);
    if (!currentSettings) return;
    currentSettings.volume = value;
    void saveSettings({ volume: value });
    if (audio) audio.volume = value;
  });

  shadow.getElementById('opacity')?.addEventListener('input', (event) => {
    event.stopPropagation();
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

  shadow.getElementById('voiceZh')?.addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value;
    if (!currentSettings) return;
    currentSettings.voiceURI_zh = value;
    void saveSettings({ voiceURI_zh: value, voiceURI: value });
  });

  shadow.getElementById('voiceEn')?.addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value;
    if (!currentSettings) return;
    currentSettings.voiceURI_en = value;
    void saveSettings({ voiceURI_en: value });
  });

  shadow.getElementById('progress')?.addEventListener('input', (event) => {
    event.stopPropagation();
    const value = Number((event.target as HTMLInputElement).value);
    if (audio && audio.duration) {
      audio.currentTime = (value / 100) * audio.duration;
    }
  });
}

function toggleLoop(): void {
  loopEnabled = !loopEnabled;
  if (currentSettings) {
    currentSettings.loopPlayback = loopEnabled;
    void saveSettings({ loopPlayback: loopEnabled });
  }
  updateLoopButton();
  if (loopEnabled && finished) {
    void handlePlay();
  }
}

function updateLoopButton(): void {
  shadow?.getElementById('loop')?.classList.toggle('active', loopEnabled);
}

function toggleSettingsPanel(): void {
  settingsOpen = !settingsOpen;
  shadow?.getElementById('panel')?.classList.toggle('open', settingsOpen);
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
  if (isScrubbingProgress) return;
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

async function handlePlaybackEnd(): Promise<void> {
  if (loopEnabled && session) {
    if (session.mode === 'blob' && audio) {
      audio.currentTime = 0;
      finished = false;
      await audio.play();
      return;
    }
    await startNativePlayback(session.text, session.settings);
    return;
  }
  playing = false;
  finished = true;
  setPlayingState(false);
  setProgress(100);
}

function ensurePlayer(settings: DreamReadSettings): void {
  currentSettings = settings;
  loopEnabled = settings.loopPlayback;
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
    loopEnabled = next.loopPlayback;
    applySettingsToControls();
    applyThemeVars();
    void populateVoiceSelects();
  });
}

function cleanupAudio(): void {
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    audio = null;
  }
  if (activeBlobUrl) {
    URL.revokeObjectURL(activeBlobUrl);
    activeBlobUrl = null;
  }
}

function attachBlobAudio(url: string, settings: DreamReadSettings): void {
  cleanupAudio();
  activeBlobUrl = url;
  audio = new Audio(url);
  audio.playbackRate = settings.rate;
  audio.volume = settings.volume;

  audio.addEventListener('timeupdate', () => {
    if (!audio?.duration || isScrubbingProgress) return;
    setProgress((audio.currentTime / audio.duration) * 100);
  });

  audio.addEventListener('ended', () => {
    void handlePlaybackEnd();
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
  startNativeProgressTracker(text, settings.rate);

  await speakWithWebSpeech(text, settings, {
    onBoundary: (charIndex, _charLength, totalLength) => {
      if (!nativeProgress) return;
      nativeProgress.boundaryChars = charIndex;
      nativeProgress.segmentChars = Math.max(totalLength, 1);
      if (isScrubbingProgress) return;
      const overall =
        ((nativeProgress.chunkCurrent - 1 + charIndex / Math.max(totalLength, 1)) /
          Math.max(1, nativeProgress.chunkTotal)) *
        100;
      setProgress(Math.min(99, overall));
    },
    onEnd: () => {
      stopNativeProgressTracker();
      void handlePlaybackEnd();
    },
    onError: (message) => {
      stopNativeProgressTracker();
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
    onChunkChange: (current, total) => {
      if (nativeProgress) {
        nativeProgress.chunkCurrent = current;
        nativeProgress.chunkTotal = Math.max(total, 1);
        nativeProgress.boundaryChars = 0;
      }
      setChunkInfo(current, total);
    },
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
  stopNativeProgressTracker();
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
  stopNativeProgressTracker();
  stopWebSpeech();
  cleanupAudio();
  session = null;
  playing = false;
  finished = false;
  loading = false;
  settingsOpen = false;
  isScrubbingProgress = false;
  dragState = null;
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
