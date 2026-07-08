import type { TTSOptions, TTSProvider, TTSResult, DreamReadSettings } from './types';
import { prepareTextForSpeech } from '../shared/text-utils';

function escapeSsml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function synthesizeWithAzure(
  text: string,
  options: TTSOptions,
  settings: DreamReadSettings,
): Promise<TTSResult> {
  const key = settings.azureKey.trim();
  const region = settings.azureRegion.trim();
  if (!key || !region) {
    throw new Error('Azure Speech key or region is not configured');
  }

  const voice = settings.azureVoice || 'zh-CN-XiaoxiaoNeural';
  const ratePercent = Math.round((options.rate - 1) * 100);
  const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
  const pitchPercent = Math.round((options.pitch - 1) * 50);
  const pitchStr = pitchPercent >= 0 ? `+${pitchPercent}%` : `${pitchPercent}%`;

  const ssml = `<speak version="1.0" xml:lang="zh-CN"><voice name="${voice}"><prosody rate="${rateStr}" pitch="${pitchStr}">${escapeSsml(prepareTextForSpeech(text))}</prosody></voice></speak>`;

  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
      },
      body: ssml,
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Azure TTS failed: ${response.status} ${detail}`.trim());
    }

    const data = await response.blob();
    return { type: 'blob', data, mimeType: 'audio/mpeg' };
  } finally {
    clearTimeout(timeout);
  }
}

export const azureProvider: TTSProvider = {
  name: 'azure',
  synthesize: synthesizeWithAzure,
};
