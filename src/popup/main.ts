import { getSettings, saveSettings } from '../shared/storage';
import { resolveSpeechLanguage, t } from '../shared/text-utils';
import {
  defaultVoiceURI,
  filterVoicesByLang,
  pickVoiceForLang,
  sortVoicesByQuality,
  voiceOptionLabel,
  waitForVoices,
} from '../shared/voices';
import type { DreamReadSettings, SpeechLanguage, TTSEngine, UILanguage } from '../tts/types';

const engineEl = document.getElementById('engine') as HTMLSelectElement;
const speechLanguageEl = document.getElementById('speechLanguage') as HTMLSelectElement;
const voiceZhEl = document.getElementById('voiceZh') as HTMLSelectElement;
const voiceEnEl = document.getElementById('voiceEn') as HTMLSelectElement;
const rateEl = document.getElementById('rate') as HTMLInputElement;
const rateValueEl = document.getElementById('rateValue') as HTMLOutputElement;
const volumeEl = document.getElementById('volume') as HTMLInputElement;
const languageEl = document.getElementById('language') as HTMLSelectElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;

function applyLabels(lang: UILanguage): void {
  (document.getElementById('label-engine') as HTMLElement).textContent = t(lang, 'engine');
  (document.getElementById('label-speech-language') as HTMLElement).textContent = t(lang, 'speechLanguage');
  (document.getElementById('label-voice-zh') as HTMLElement).textContent = t(lang, 'voiceZh');
  (document.getElementById('label-voice-en') as HTMLElement).textContent = t(lang, 'voiceEn');
  (document.getElementById('label-rate') as HTMLElement).textContent = t(lang, 'speed');
  (document.getElementById('label-volume') as HTMLElement).textContent = t(lang, 'volume');
  (document.getElementById('label-language') as HTMLElement).textContent = t(lang, 'language');
  (document.getElementById('shortcutHint') as HTMLElement).textContent = t(lang, 'shortcut');
  (document.getElementById('voiceHint') as HTMLElement).textContent = t(lang, 'voiceNaturalHint');
  (document.getElementById('openOptions') as HTMLButtonElement).textContent = t(lang, 'openOptions');
  (document.getElementById('testVoice') as HTMLButtonElement).textContent = t(lang, 'testVoice');
  (document.getElementById('subtitle') as HTMLElement).textContent =
    lang === 'zh-CN' ? '划词朗读' : 'Select text to listen';
  speechLanguageEl.options[0].textContent = t(lang, 'speechAuto');
}

function fillVoiceSelect(
  select: HTMLSelectElement,
  voices: SpeechSynthesisVoice[],
  lang: string,
  selected: string,
): void {
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
}

async function loadVoices(settings: DreamReadSettings): Promise<void> {
  const voices = await waitForVoices();
  fillVoiceSelect(voiceZhEl, voices, 'zh-CN', settings.voiceURI_zh || settings.voiceURI);
  fillVoiceSelect(voiceEnEl, voices, 'en-US', settings.voiceURI_en || settings.voiceURI);
}

function bindForm(settings: DreamReadSettings): void {
  engineEl.value = settings.engine;
  speechLanguageEl.value = settings.speechLanguage;
  rateEl.value = String(settings.rate);
  rateValueEl.textContent = `${settings.rate.toFixed(1)}x`;
  volumeEl.value = String(settings.volume);
  languageEl.value = settings.language;
  applyLabels(settings.language);
}

async function persist(partial: Partial<DreamReadSettings>): Promise<void> {
  await saveSettings(partial);
  const settings = await getSettings();
  applyLabels(settings.language);
  statusEl.textContent = t(settings.language, 'saved');
  setTimeout(() => {
    statusEl.textContent = '';
  }, 1200);
}

engineEl.addEventListener('change', () => {
  void persist({ engine: engineEl.value as TTSEngine });
});

speechLanguageEl.addEventListener('change', () => {
  void persist({ speechLanguage: speechLanguageEl.value as SpeechLanguage });
});

voiceZhEl.addEventListener('change', () => {
  void persist({ voiceURI_zh: voiceZhEl.value, voiceURI: voiceZhEl.value });
});

voiceEnEl.addEventListener('change', () => {
  void persist({ voiceURI_en: voiceEnEl.value });
});

rateEl.addEventListener('input', () => {
  rateValueEl.textContent = `${Number(rateEl.value).toFixed(1)}x`;
  void persist({ rate: Number(rateEl.value) });
});

volumeEl.addEventListener('input', () => {
  void persist({ volume: Number(volumeEl.value) });
});

languageEl.addEventListener('change', () => {
  void persist({ language: languageEl.value as UILanguage });
});

document.getElementById('openOptions')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('testVoice')?.addEventListener('click', async () => {
  const settings = await getSettings();
  const sample =
    settings.language === 'zh-CN'
      ? '你好，这是 DreamRead 语音试听。'
      : 'Hello, this is a DreamRead voice preview.';
  const speechLang = resolveSpeechLanguage(sample, settings.speechLanguage);
  const voices = await waitForVoices();
  const utterance = new SpeechSynthesisUtterance(sample);
  utterance.rate = settings.rate;
  utterance.volume = settings.volume;
  utterance.pitch = settings.pitch;
  utterance.lang = speechLang;
  const preferred = speechLang.startsWith('zh') ? settings.voiceURI_zh : settings.voiceURI_en;
  const voice = pickVoiceForLang(voices, speechLang, preferred || settings.voiceURI);
  if (voice) utterance.voice = voice;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
});

void (async () => {
  const settings = await getSettings();
  bindForm(settings);
  await loadVoices(settings);
})();
