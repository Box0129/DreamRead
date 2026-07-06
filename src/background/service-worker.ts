import { getSettings, onSettingsChanged } from '../shared/storage';
import { splitTextIntoChunks, t } from '../shared/text-utils';
import type { ExtensionMessage, SynthesizeResponse } from '../shared/messages';
import { synthesizeRemote } from '../tts';

const MENU_ID = 'voicer-read-this';

function setupContextMenu(): void {
  void getSettings().then((settings) => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_ID,
        title: t(settings.language, 'readThis'),
        contexts: ['selection'],
      });
    });
  });
}

async function sendToTab<T = unknown>(
  tabId: number,
  message: ExtensionMessage,
): Promise<T | undefined> {
  return chrome.tabs.sendMessage(tabId, message);
}

async function startReading(tabId: number, text: string): Promise<void> {
  const settings = await getSettings();
  const chunks = splitTextIntoChunks(text);
  if (chunks.length === 0) return;

  await sendToTab(tabId, {
    type: 'START_READ',
    text: chunks.join('\n\n'),
    settings,
  });
}

async function readSelectionFromTab(tabId: number): Promise<void> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.getSelection()?.toString() ?? '',
  });

  const text = typeof result === 'string' ? result.trim() : '';
  if (!text) return;
  await startReading(tabId, text);
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenu();
});

onSettingsChanged((settings) => {
  chrome.contextMenus.update(MENU_ID, {
    title: t(settings.language, 'readThis'),
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  const text = info.selectionText?.trim();
  if (!text) return;
  await startReading(tab.id, text);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'read-selection') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await readSelectionFromTab(tab.id);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'SYNTHESIZE') return false;

  void (async () => {
    const settings = message.settings;
    try {
      const result = await synthesizeRemote(message.text, settings);
      if (result.type === 'native') {
        sendResponse({ ok: true, native: true } satisfies SynthesizeResponse & { native?: boolean });
        return;
      }

      const blobUrl = URL.createObjectURL(result.data);
      sendResponse({
        ok: true,
        blobUrl,
        mimeType: result.mimeType,
      } satisfies SynthesizeResponse);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (settings.fallbackToWebSpeech && settings.engine !== 'web-speech') {
        sendResponse({
          ok: true,
          native: true,
          fallback: true,
          error: errorMessage,
        } satisfies SynthesizeResponse & { native?: boolean });
        return;
      }
      sendResponse({ ok: false, error: errorMessage } satisfies SynthesizeResponse);
    }
  })();

  return true;
});

export {};
