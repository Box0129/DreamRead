import type { DreamReadSettings } from '../tts/types';
import { DEFAULT_SETTINGS } from '../tts/types';

const SYNC_KEYS: (keyof DreamReadSettings)[] = [
  'engine',
  'rate',
  'pitch',
  'volume',
  'voiceURI',
  'httpEndpoint',
  'azureRegion',
  'azureVoice',
  'language',
  'speechLanguage',
  'fallbackToWebSpeech',
  'playerOpacity',
  'playerTheme',
];

const LOCAL_KEYS: (keyof DreamReadSettings)[] = ['azureKey'];

export async function getSettings(): Promise<DreamReadSettings> {
  const [syncData, localData] = await Promise.all([
    chrome.storage.sync.get(SYNC_KEYS),
    chrome.storage.local.get(LOCAL_KEYS),
  ]);

  return {
    ...DEFAULT_SETTINGS,
    ...(syncData as Partial<DreamReadSettings>),
    ...(localData as Partial<DreamReadSettings>),
  };
}

export async function saveSettings(partial: Partial<DreamReadSettings>): Promise<void> {
  const syncUpdate: Partial<DreamReadSettings> = {};
  const localUpdate: Partial<DreamReadSettings> = {};

  for (const [key, value] of Object.entries(partial) as [keyof DreamReadSettings, unknown][]) {
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

export function onSettingsChanged(callback: (settings: DreamReadSettings) => void): () => void {
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
