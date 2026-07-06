export type TTSEngine = 'web-speech' | 'http' | 'azure';

export type UILanguage = 'zh-CN' | 'en-US';

export type SpeechLanguage = 'auto' | 'zh-CN' | 'en-US';

export type PlayerTheme = 'candy' | 'ocean' | 'forest' | 'night';

export interface DreamReadSettings {
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
  speechLanguage: SpeechLanguage;
  fallbackToWebSpeech: boolean;
  playerOpacity: number;
  playerTheme: PlayerTheme;
}

export const DEFAULT_SETTINGS: DreamReadSettings = {
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
  speechLanguage: 'auto',
  fallbackToWebSpeech: true,
  playerOpacity: 0.72,
  playerTheme: 'candy',
};

/** @deprecated Use DreamReadSettings */
export type VoicerSettings = DreamReadSettings;

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
  synthesize(text: string, options: TTSOptions, settings: DreamReadSettings): Promise<TTSResult>;
}

export interface LanguageSegment {
  lang: 'zh-CN' | 'en-US';
  text: string;
}
