import type { DreamReadSettings } from '../tts/types';

export type MessageType =
  | 'START_READ'
  | 'SYNTHESIZE'
  | 'PLAY_BLOB'
  | 'GET_SELECTION'
  | 'STOP_READ'
  | 'OPEN_OPTIONS'
  | 'PING';

export interface PingMessage {
  type: 'PING';
}

export interface StartReadMessage {
  type: 'START_READ';
  text: string;
  settings: DreamReadSettings;
}

export interface SynthesizeMessage {
  type: 'SYNTHESIZE';
  text: string;
  settings: DreamReadSettings;
  requestId: string;
}

export interface PlayBlobMessage {
  type: 'PLAY_BLOB';
  blobUrl: string;
  mimeType: string;
  text: string;
  settings: DreamReadSettings;
  requestId: string;
  fallback?: boolean;
  error?: string;
}

export interface GetSelectionMessage {
  type: 'GET_SELECTION';
}

export interface StopReadMessage {
  type: 'STOP_READ';
}

export interface OpenOptionsMessage {
  type: 'OPEN_OPTIONS';
}

export type ExtensionMessage =
  | StartReadMessage
  | SynthesizeMessage
  | PlayBlobMessage
  | GetSelectionMessage
  | StopReadMessage
  | OpenOptionsMessage
  | PingMessage;

export interface SynthesizeResponse {
  ok: boolean;
  blobUrl?: string;
  mimeType?: string;
  error?: string;
  fallback?: boolean;
}
