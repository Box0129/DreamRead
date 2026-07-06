import { getSettings, saveSettings } from '../shared/storage';
import { resolveSpeechLanguage, t } from '../shared/text-utils';
import type { DreamReadSettings, SpeechLanguage, TTSEngine, UILanguage } from '../tts/types';

const engineEl = document.getElementById('engine') as HTMLSelectElement;
const speechLanguageEl = document.getElementById('speechLanguage') as HTMLSelectElement;
const voiceEl = document.getElementById('voice') as HTMLSelectElement;
const rateEl = document.getElementById('rate') as HTMLInputElement;
const rateValueEl = document.getElementById('rateValue') as HTMLOutputElement;
const volumeEl = document.getElementById('volume') as HTMLInputElement;
const languageEl = document.getElementById('language') as HTMLSelectElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;

function applyLabels(lang: UILanguage): void {
  (document.getElementById('label-engine') as HTMLElement).textContent = t(lang, 'engine');
  (document.getElementById('label-speech-language') as HTMLElement).textContent = t(lang, 'speechLanguage');
  (document.getElementById('label-voice') as HTMLElement).textContent = t(lang, 'voice');
  (document.getElementById('label-rate') as HTMLElement).textContent = t(lang, 'speed');
  (document.getElementById('label-volume') as HTMLElement).textContent = t(lang, 'volume');
  (document.getElementById('label-language') as HTMLElement).textContent = t(lang, 'language');
  (document.getElementById('shortcutHint') as HTMLElement).textContent = t(lang, 'shortcut');
  (document.getElementById('openOptions') as HTMLButtonElement).textContent = t(lang, 'openOptions');
  (document.getElementById('testVoice') as HTMLButtonElement).textContent = t(lang, 'testVoice');
  (document.getElementById('subtitle') as HTMLElement).textContent =
    lang === 'zh-CN' ? '划词朗读' : 'Select text to listen';
  speechLanguageEl.options[0].textContent = t(lang, 'speechAuto');
}

async function loadVoices(settings: DreamReadSettings): Promise<void> {
  voiceEl.innerHTML = '';
  if (speechSynthesis.getVoices().length === 0) {
    await new Promise<void>((resolve) => {
      speechSynthesis.onvoiceschanged = () => resolve();
      setTimeout(resolve, 300);
    });
  }

  for (const voice of speechSynthesis.getVoices()) {
    const option = document.createElement('option');
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceEl.appendChild(option);
  }

  if (settings.voiceURI) {
    voiceEl.value = settings.voiceURI;
  }
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

voiceEl.addEventListener('change', () => {
  void persist({ voiceURI: voiceEl.value });
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
  const utterance = new SpeechSynthesisUtterance(sample);
  utterance.rate = settings.rate;
  utterance.volume = settings.volume;
  utterance.pitch = settings.pitch;
  utterance.lang = speechLang;
  const voice = speechSynthesis.getVoices().find(
    (v) => v.voiceURI === settings.voiceURI && v.lang.startsWith(speechLang.slice(0, 2)),
  ) ?? speechSynthesis.getVoices().find((v) => v.lang.startsWith(speechLang));
  if (voice) utterance.voice = voice;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
});

void (async () => {
  const settings = await getSettings();
  bindForm(settings);
  await loadVoices(settings);
})();
