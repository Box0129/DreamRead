import type { TTSOptions, TTSResult, VoicerSettings } from './types';
import { azureProvider } from './azure-provider';
import { httpProvider } from './http-provider';

export async function synthesizeRemote(
  text: string,
  settings: VoicerSettings,
  options?: Partial<TTSOptions>,
): Promise<TTSResult> {
  const ttsOptions: TTSOptions = {
    rate: options?.rate ?? settings.rate,
    pitch: options?.pitch ?? settings.pitch,
    volume: options?.volume ?? settings.volume,
    voiceURI: options?.voiceURI ?? settings.voiceURI,
    language: settings.language,
  };

  if (settings.engine === 'azure') {
    return azureProvider.synthesize(text, ttsOptions, settings);
  }

  if (settings.engine === 'http') {
    return httpProvider.synthesize(text, ttsOptions, settings);
  }

  return { type: 'native' };
}

export { httpProvider, azureProvider };
