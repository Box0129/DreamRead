import type { TTSOptions, TTSProvider, TTSResult, DreamReadSettings } from './types';

export async function synthesizeWithHttp(
  text: string,
  options: TTSOptions,
  settings: DreamReadSettings,
): Promise<TTSResult> {
  const endpoint = settings.httpEndpoint.trim();
  if (!endpoint) {
    throw new Error('HTTP TTS endpoint is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/*',
      },
      body: JSON.stringify({
        text,
        voice: settings.voiceURI || 'default',
        speed: options.rate,
        pitch: options.pitch,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP TTS failed: ${response.status} ${response.statusText}`);
    }

    const mimeType = response.headers.get('Content-Type') || 'audio/wav';
    const data = await response.blob();
    if (data.size === 0) {
      throw new Error('HTTP TTS returned empty audio');
    }

    return { type: 'blob', data, mimeType };
  } finally {
    clearTimeout(timeout);
  }
}

export const httpProvider: TTSProvider = {
  name: 'http',
  synthesize: synthesizeWithHttp,
};
