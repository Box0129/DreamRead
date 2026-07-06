import type { ExtensionMessage } from '../shared/messages';
import { getSettings } from '../shared/storage';
import { t } from '../shared/text-utils';
import {
  destroyPlayer,
  playBlob,
  playNative,
  showLoading,
  stopAll,
} from './player';

async function handleStartRead(message: Extract<ExtensionMessage, { type: 'START_READ' }>): Promise<void> {
  const { text, settings } = message;
  if (!text.trim()) return;

  stopAll();

  if (settings.engine === 'web-speech') {
    await playNative(text, settings);
    return;
  }

  showLoading(settings);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SYNTHESIZE',
      text,
      settings,
      requestId: crypto.randomUUID(),
    });

    if (response?.native) {
      const notice = response.fallback
        ? t(settings.language, 'fallbackNotice')
        : undefined;
      await playNative(text, { ...settings, engine: 'web-speech' }, notice);
      return;
    }

    if (!response?.ok || !response.blobUrl) {
      throw new Error(response?.error || 'Synthesis failed');
    }

    await playBlob(response.blobUrl, response.mimeType || 'audio/wav', settings);
  } catch (error) {
    const settingsNow = await getSettings();
    if (settingsNow.fallbackToWebSpeech) {
      await playNative(
        text,
        { ...settingsNow, engine: 'web-speech' },
        t(settingsNow.language, 'fallbackNotice'),
      );
      return;
    }
    const messageText = error instanceof Error ? error.message : String(error);
    console.error('[DreamRead]', messageText);
    destroyPlayer();
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'START_READ') {
    void handleStartRead(message).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === 'STOP_READ') {
    stopAll();
    destroyPlayer();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'GET_SELECTION') {
    sendResponse({ text: window.getSelection()?.toString() ?? '' });
    return true;
  }

  return false;
});

export {};
