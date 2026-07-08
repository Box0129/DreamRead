import type { LanguageSegment } from '../tts/types';

const MAX_CHUNK_LENGTH = 5000;

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

export function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Strip punctuation so TTS engines won't speak symbols aloud. */
export function prepareTextForSpeech(text: string): string {
  let cleaned = text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));

  cleaned = cleaned
    .replace(/[\u3000-\u303f\uff00-\uffef]/g, ' ')
    .replace(/[\u2000-\u206f\u2e00-\u2e7f]/g, ' ')
    .replace(/[\u00a0-\u00bf]/g, ' ');

  cleaned = cleaned.replace(/[^\w\s\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ');

  return normalizeText(cleaned);
}

export function isSpeechReadyText(text: string): boolean {
  return /[\w\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(text);
}

export function isCjkChar(char: string): boolean {
  return CJK_RE.test(char);
}

export function detectDominantLanguage(text: string): 'zh-CN' | 'en-US' {
  let cjk = 0;
  let latin = 0;
  for (const ch of text) {
    if (isCjkChar(ch)) cjk += 1;
    else if (/[A-Za-z]/.test(ch)) latin += 1;
  }
  return cjk >= latin ? 'zh-CN' : 'en-US';
}

type SegmentLang = 'zh-CN' | 'en-US';

function classifyChar(ch: string): SegmentLang | 'neutral' {
  if (/\s/.test(ch)) return 'neutral';
  if (isCjkChar(ch)) return 'zh-CN';
  if (/[A-Za-z]/.test(ch)) return 'en-US';
  if (/\d/.test(ch)) return 'neutral';
  return 'neutral';
}

/** Split text into homogeneous zh/en segments so TTS won't mix accents. */
export function splitByLanguage(text: string): LanguageSegment[] {
  const normalized = prepareTextForSpeech(text);
  if (!normalized) return [];

  const segments: LanguageSegment[] = [];
  let buffer = '';
  let bufferLang: SegmentLang | null = null;

  const flush = (): void => {
    const trimmed = buffer.trim();
    if (trimmed && bufferLang) segments.push({ lang: bufferLang, text: trimmed });
    buffer = '';
    bufferLang = null;
  };

  for (const ch of normalized) {
    const kind = classifyChar(ch);

    if (kind === 'neutral') {
      buffer += /\s/.test(ch) ? ' ' : ch;
      continue;
    }

    if (bufferLang === null) {
      bufferLang = kind;
      buffer += ch;
      continue;
    }

    if (kind === bufferLang) {
      buffer += ch;
      continue;
    }

    flush();
    bufferLang = kind;
    buffer = ch;
  }

  flush();

  if (segments.length > 0) return segments;

  const fallbackLang = detectDominantLanguage(normalized);
  return normalized ? [{ lang: fallbackLang, text: normalized }] : [];
}

export function resolveSpeechLanguage(
  text: string,
  preference: 'auto' | 'zh-CN' | 'en-US',
): 'zh-CN' | 'en-US' {
  if (preference !== 'auto') return preference;
  return detectDominantLanguage(text);
}

export function splitTextIntoChunks(text: string, maxLength = MAX_CHUNK_LENGTH): string[] {
  const normalized = prepareTextForSpeech(text);
  if (normalized.length <= maxLength) {
    return normalized ? [normalized] : [];
  }

  const chunks: string[] = [];
  const paragraphs = normalized.split(/\n\n+/);
  let current = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxLength) {
      if (current) {
        chunks.push(current.trim());
        current = '';
      }
      for (let i = 0; i < paragraph.length; i += maxLength) {
        chunks.push(paragraph.slice(i, i + maxLength).trim());
      }
      continue;
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > maxLength) {
      if (current) chunks.push(current.trim());
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

export const i18n = {
  'zh-CN': {
    readThis: '朗读此内容 / Read This',
    play: '播放',
    pause: '暂停',
    stop: '停止',
    close: '关闭',
    loading: '正在合成语音…',
    speed: '语速',
    volume: '音量',
    opacity: '透明度',
    theme: '主题',
    engine: 'TTS 引擎',
    voice: '音色',
    language: '界面语言',
    speechLanguage: '朗读语言',
    speechAuto: '自动检测',
    settings: '设置',
    openOptions: '高级设置',
    webSpeech: '浏览器内置 (Web Speech)',
    http: 'HTTP / ChatTTS',
    azure: 'Azure Speech',
    fallbackNotice: '远程 TTS 失败，已降级为浏览器内置语音',
    error: '朗读失败',
    shortcut: '快捷键 Alt+R 朗读选区',
    httpEndpoint: 'HTTP TTS 端点',
    azureKey: 'Azure Speech Key',
    azureRegion: 'Azure 区域',
    azureVoice: 'Azure 音色',
    fallback: '失败时降级到 Web Speech',
    save: '保存',
    saved: '已保存',
    testVoice: '试听',
    chunkProgress: '分段',
    loop: '循环',
    dragHint: '拖动标题栏移动',
    voiceNaturalHint: '★ 标记为推荐自然音色',
    voiceZh: '中文音色',
    voiceEn: '英文音色',
    themeCandy: '糖果粉',
    themeOcean: '海洋蓝',
    themeForest: '森林绿',
    themeNight: '星空夜',
  },
  'en-US': {
    readThis: 'Read This / 朗读此内容',
    play: 'Play',
    pause: 'Pause',
    stop: 'Stop',
    close: 'Close',
    loading: 'Synthesizing speech…',
    speed: 'Speed',
    volume: 'Volume',
    opacity: 'Opacity',
    theme: 'Theme',
    engine: 'TTS Engine',
    voice: 'Voice',
    language: 'UI Language',
    speechLanguage: 'Speech Language',
    speechAuto: 'Auto detect',
    settings: 'Settings',
    openOptions: 'Advanced Settings',
    webSpeech: 'Browser Built-in (Web Speech)',
    http: 'HTTP / ChatTTS',
    azure: 'Azure Speech',
    fallbackNotice: 'Remote TTS failed, fell back to Web Speech',
    error: 'Failed to read aloud',
    shortcut: 'Shortcut Alt+R to read selection',
    httpEndpoint: 'HTTP TTS Endpoint',
    azureKey: 'Azure Speech Key',
    azureRegion: 'Azure Region',
    azureVoice: 'Azure Voice',
    fallback: 'Fallback to Web Speech on failure',
    save: 'Save',
    saved: 'Saved',
    testVoice: 'Preview',
    chunkProgress: 'Chunk',
    loop: 'Loop',
    dragHint: 'Drag header to move',
    voiceNaturalHint: '★ marks recommended natural voices',
    voiceZh: 'Chinese voice',
    voiceEn: 'English voice',
    themeCandy: 'Candy Pink',
    themeOcean: 'Ocean Blue',
    themeForest: 'Forest Green',
    themeNight: 'Starry Night',
  },
} as const;

export type I18nKey = keyof (typeof i18n)['zh-CN'];

export function t(lang: keyof typeof i18n, key: I18nKey): string {
  return i18n[lang][key];
}
