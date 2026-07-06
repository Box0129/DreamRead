import type { VoicerSettings } from '../tts/types';
import { DEFAULT_SETTINGS } from '../tts/types';

const SYNC_KEYS: (keyof VoicerSettings)[] = [
  'engine',
  'rate',
  'pitch',
  'volume',
  'voiceURI',
  'httpEndpoint',
  'azureRegion',
  'azureVoice',
  'language',
  'fallbackToWebSpeech',
];

const LOCAL_KEYS: (keyof VoicerSettings)[] = ['azureKey'];

export async function getSettings(): Promise<VoicerSettings> {
  const [syncData, localData] = await Promise.all([
    chrome.storage.sync.get(SYNC_KEYS),
    chrome.storage.local.get(LOCAL_KEYS),
  ]);

  return {
    ...DEFAULT_SETTINGS,
    ...(syncData as Partial<VoicerSettings>),
    ...(localData as Partial<VoicerSettings>),
  };
}

export async function saveSettings(partial: Partial<VoicerSettings>): Promise<void> {
  const syncUpdate: Partial<VoicerSettings> = {};
  const localUpdate: Partial<VoicerSettings> = {};

  for (const [key, value] of Object.entries(partial) as [keyof VoicerSettings, unknown][]) {
    if (LOCAL_KEYS.includes(key)) {
      (localUpdate as Record<string, unknown>)[key] = value;
    } else if (SYNC_KEYS.includes(key)) {
      (syncUpdate as Record<string, unknown>)[key] = value;
    }
  }

  const tasks: Promise<void>[] = [];
  if (Object.keys(syncUpdate).length > 0) {
    tasks.push(chrome.storage.sync.set(syncUpdate));
  }
  if (Object.keys(localUpdate).length > 0) {
    tasks.push(chrome.storage.local.set(localUpdate));
  }
  await Promise.all(tasks);
}

export function onSettingsChanged(callback: (settings: VoicerSettings) => void): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string,
  ) => {
    if (areaName === 'sync' || areaName === 'local') {
      const relevant = [...SYNC_KEYS, ...LOCAL_KEYS].some((key) => key in changes);
      if (relevant) {
        void getSettings().then(callback);
      }
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
