import type { DreamReadSettings } from '../tts/types';

export type MessageType =
  | 'START_READ'
  | 'READ_ACTIVE_SELECTION'
  | 'SYNTHESIZE'
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

export interface ReadActiveSelectionMessage {
  type: 'READ_ACTIVE_SELECTION';
}

export interface SynthesizeMessage {
  type: 'SYNTHESIZE';
  text: string;
  settings: DreamReadSettings;
  requestId: string;
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
  | ReadActiveSelectionMessage
  | SynthesizeMessage
  | GetSelectionMessage
  | StopReadMessage
  | OpenOptionsMessage
  | PingMessage;

export interface SynthesizeResponse {
  ok: boolean;
  audioBase64?: string;
  mimeType?: string;
  error?: string;
  fallback?: boolean;
}
