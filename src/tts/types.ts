export type TTSEngine = 'web-speech' | 'http' | 'azure';

export type UILanguage = 'zh-CN' | 'en-US';

export interface VoicerSettings {
  engine: TTSEngine;
  rate: number;
  pitch: number;
  volume: number;
  voiceURI: string;
  httpEndpoint: string;
  azureKey: string;
  azureRegion: string;
  azureVoice: string;
  language: UILanguage;
  fallbackToWebSpeech: boolean;
}

export const DEFAULT_SETTINGS: VoicerSettings = {
  engine: 'web-speech',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  voiceURI: '',
  httpEndpoint: 'http://localhost:9966/tts',
  azureKey: '',
  azureRegion: 'eastasia',
  azureVoice: 'zh-CN-XiaoxiaoNeural',
  language: 'zh-CN',
  fallbackToWebSpeech: true,
};

export interface TTSOptions {
  rate: number;
  pitch: number;
  volume: number;
  voiceURI?: string;
  language?: string;
}

export type TTSResult =
  | { type: 'native' }
  | { type: 'blob'; data: Blob; mimeType: string };

export interface TTSProvider {
  name: string;
  synthesize(text: string, options: TTSOptions, settings: VoicerSettings): Promise<TTSResult>;
}
