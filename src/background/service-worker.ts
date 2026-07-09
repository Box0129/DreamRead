import { getSettings, onSettingsChanged } from '../shared/storage';
import { splitTextIntoChunks, normalizeInputText, isSpeechReadyText, t } from '../shared/text-utils';
import type { ExtensionMessage, SynthesizeResponse } from '../shared/messages';
import { synthesizeRemote } from '../tts';

const MENU_ID = 'dreamread-read-this';

const RESTRICTED_URL_RE =
  /^(chrome:|chrome-extension:|edge:|about:|devtools:|view-source:|https:\/\/chrome\.google\.com\/webstore)/i;

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

async function isInjectableTab(tabId: number): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = tab.url ?? tab.pendingUrl ?? '';
    return Boolean(url) && !RESTRICTED_URL_RE.test(url);
  } catch {
    return false;
  }
}

function getContentScriptFiles(): string[] {
  const entry = chrome.runtime.getManifest().content_scripts?.[0];
  return entry?.js ? [...entry.js] : [];
}

async function pingContentScript(tabId: number): Promise<boolean> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return response?.ok === true;
  } catch {
    return false;
  }
}

async function ensureContentScript(tabId: number): Promise<void> {
  if (await pingContentScript(tabId)) return;

  const files = getContentScriptFiles();
  if (files.length === 0) {
    throw new Error('DreamRead content script is not configured');
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files,
  });

  for (let attempt = 0; attempt < 8; attempt++) {
    if (await pingContentScript(tabId)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error('DreamRead failed to connect to this page. Try refreshing the tab.');
}

async function sendToTab<T = unknown>(
  tabId: number,
  message: ExtensionMessage,
): Promise<T | undefined> {
  await ensureContentScript(tabId);
  return chrome.tabs.sendMessage(tabId, message) as Promise<T | undefined>;
}

async function startReading(tabId: number, text: string): Promise<void> {
  if (!(await isInjectableTab(tabId))) return;

  const settings = await getSettings();
  const normalized = normalizeInputText(text);
  if (!isSpeechReadyText(normalized)) return;

  const chunks = splitTextIntoChunks(normalized);
  if (chunks.length === 0) return;

  await sendToTab(tabId, {
    type: 'START_READ',
    text: chunks.join('\n\n'),
    settings,
  });
}

async function readSelectionFromTab(tabId: number): Promise<void> {
  if (!(await isInjectableTab(tabId))) return;

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.getSelection()?.toString() ?? '',
  });

  const text = typeof result === 'string' ? result.trim() : '';
  if (!text) return;
  await startReading(tabId, text);
}

function runSafely(task: () => Promise<void>): void {
  void task().catch((error) => {
    console.warn('[DreamRead]', error instanceof Error ? error.message : error);
  });
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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  const text = info.selectionText?.trim();
  if (!text) return;
  runSafely(() => startReading(tab.id!, text));
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'read-selection') return;
  runSafely(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await readSelectionFromTab(tab.id);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }

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
