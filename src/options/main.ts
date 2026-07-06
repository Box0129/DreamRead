import { getSettings, saveSettings } from '../shared/storage';
import { t } from '../shared/text-utils';
import type { UILanguage } from '../tts/types';

const httpEndpointEl = document.getElementById('httpEndpoint') as HTMLInputElement;
const azureKeyEl = document.getElementById('azureKey') as HTMLInputElement;
const azureRegionEl = document.getElementById('azureRegion') as HTMLInputElement;
const azureVoiceEl = document.getElementById('azureVoice') as HTMLInputElement;
const fallbackEl = document.getElementById('fallbackToWebSpeech') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;

function applyLabels(lang: UILanguage): void {
  (document.getElementById('subtitle') as HTMLElement).textContent =
    lang === 'zh-CN' ? '高级设置' : 'Advanced Settings';
  (document.getElementById('section-http') as HTMLElement).textContent = t(lang, 'http');
  (document.getElementById('section-azure') as HTMLElement).textContent = t(lang, 'azure');
  (document.getElementById('section-general') as HTMLElement).textContent =
    lang === 'zh-CN' ? '通用' : 'General';
  (document.getElementById('label-http-endpoint') as HTMLElement).textContent = t(lang, 'httpEndpoint');
  (document.getElementById('label-azure-key') as HTMLElement).textContent = t(lang, 'azureKey');
  (document.getElementById('label-azure-region') as HTMLElement).textContent = t(lang, 'azureRegion');
  (document.getElementById('label-azure-voice') as HTMLElement).textContent = t(lang, 'azureVoice');
  (document.getElementById('label-fallback') as HTMLElement).textContent = t(lang, 'fallback');
  (document.getElementById('shortcutHint') as HTMLElement).textContent = t(lang, 'shortcut');
  (document.getElementById('save') as HTMLButtonElement).textContent = t(lang, 'save');
  (document.getElementById('httpHint') as HTMLElement).textContent =
    lang === 'zh-CN'
      ? '对接自建 ChatTTS 服务，POST JSON: { text, voice, speed }'
      : 'Connect to a self-hosted ChatTTS service via POST JSON: { text, voice, speed }';
}

document.getElementById('save')?.addEventListener('click', async () => {
  await saveSettings({
    httpEndpoint: httpEndpointEl.value.trim(),
    azureKey: azureKeyEl.value.trim(),
    azureRegion: azureRegionEl.value.trim(),
    azureVoice: azureVoiceEl.value.trim(),
    fallbackToWebSpeech: fallbackEl.checked,
  });
  const settings = await getSettings();
  applyLabels(settings.language);
  statusEl.textContent = t(settings.language, 'saved');
});

void (async () => {
  const settings = await getSettings();
  httpEndpointEl.value = settings.httpEndpoint;
  azureKeyEl.value = settings.azureKey;
  azureRegionEl.value = settings.azureRegion;
  azureVoiceEl.value = settings.azureVoice;
  fallbackEl.checked = settings.fallbackToWebSpeech;
  applyLabels(settings.language);
})();
