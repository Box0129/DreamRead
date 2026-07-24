import type { LanguageSegment } from '../tts/types';

const MAX_CHUNK_LENGTH = 5000;

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

export interface SpeechUnit {
  text: string;
  pauseAfterMs: number;
}

export const SPEECH_PAUSE = {
  sentence: 550,
  clause: 280,
  phrase: 110,
  paragraph: 800,
  none: 0,
} as const;

type SpeechLang = 'zh-CN' | 'en-US';

const ZH_MAX_CHARS = 42;
const ZH_MIN_CHARS = 10;
const EN_MAX_WORDS = 30;
const EN_MIN_WORDS = 6;
const MAX_PHRASE_SPLITS = 20;

const ZH_BREAK_BEFORE = [
  '但是',
  '不过',
  '所以',
  '因此',
  '然后',
  '同时',
  '另外',
  '如果',
  '虽然',
  '因为',
];
const ZH_BREAK_AFTER = ['的时候', '之后', '以后', '以前', '以来'];

const EN_BREAK_WORDS = new Set([
  'but',
  'because',
  'while',
  'though',
  'although',
  'however',
  'therefore',
  'whereas',
]);

const EN_ABBREV = /^(Mr|Mrs|Ms|Dr|Prof|Jr|Sr|St|vs|etc|eg|ie|Inc|Ltd|Co)$/i;

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeInputText(text: string): string {
  const withAsciiDigits = text.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
  return normalizeText(withAsciiDigits);
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

function isSentenceDelimiter(ch: string): boolean {
  return /[。！？!?]/.test(ch);
}

function isClauseDelimiter(ch: string): boolean {
  return /[，、；;：:]/.test(ch) || /[,;]/.test(ch);
}

function isSkippablePunctuation(ch: string): boolean {
  return /[^\w\s\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\d.]/.test(ch);
}

function nextNonSpace(text: string, index: number): string {
  for (let i = index + 1; i < text.length; i++) {
    if (!/\s/.test(text[i])) return text[i];
  }
  return '';
}

function wordBeforePeriod(text: string, index: number): string {
  let end = index - 1;
  while (end >= 0 && /\s/.test(text[end])) end -= 1;
  let start = end;
  while (start >= 0 && /[A-Za-z]/.test(text[start])) start -= 1;
  return text.slice(start + 1, end + 1);
}

/** Treat `.` as sentence end unless it looks like a decimal, abbreviation, or initialism. */
function isEnglishSentencePeriod(text: string, index: number): boolean {
  if (text[index] !== '.') return false;

  const prev = text[index - 1] ?? '';
  const next = nextNonSpace(text, index);

  if (/\d/.test(prev) && /\d/.test(next)) return false;

  const word = wordBeforePeriod(text, index);
  if (word && EN_ABBREV.test(word)) return false;
  if (word.length === 1 && /[A-Z]/.test(word)) return false;
  if (/\d/.test(prev) && /[A-Za-z\u4e00-\u9fff]/.test(next)) return false;

  if (!next) return true;

  const hasSpaceAfter = /\s/.test(text[index + 1] ?? '');
  if (hasSpaceAfter && /[A-Za-z\u4e00-\u9fff0-9"']/.test(next)) return true;

  if (/[\n\r]/.test(text[index + 1] ?? '')) return true;

  return false;
}

function isEnglishListPeriod(text: string, index: number): boolean {
  if (text[index] !== '.') return false;
  const prev = text[index - 1] ?? '';
  const next = nextNonSpace(text, index);
  return /\d/.test(prev) && /[A-Za-z\u4e00-\u9fff]/.test(next);
}

interface RawSpeechUnit {
  text: string;
  pauseAfterMs: number;
}

function splitByPunctuation(text: string): RawSpeechUnit[] {
  const units: RawSpeechUnit[] = [];
  let buffer = '';

  const push = (pauseAfterMs: number): void => {
    if (buffer.trim()) units.push({ text: buffer, pauseAfterMs });
    buffer = '';
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '\n') {
      if (text[i + 1] === '\n') {
        push(SPEECH_PAUSE.paragraph);
        i += 1;
        continue;
      }
      push(SPEECH_PAUSE.clause);
      continue;
    }

    if (ch === '.') {
      if (isEnglishSentencePeriod(text, i)) {
        push(SPEECH_PAUSE.sentence);
      } else if (isEnglishListPeriod(text, i)) {
        push(SPEECH_PAUSE.clause);
      }
      continue;
    }

    if (isSentenceDelimiter(ch)) {
      push(SPEECH_PAUSE.sentence);
      continue;
    }

    if (isClauseDelimiter(ch)) {
      push(SPEECH_PAUSE.clause);
      continue;
    }

    if (
      ch === '-' &&
      /[A-Za-z0-9]/.test(text[i - 1] ?? '') &&
      /[A-Za-z0-9]/.test(text[i + 1] ?? '')
    ) {
      buffer += ch;
      continue;
    }

    if (isSkippablePunctuation(ch)) {
      continue;
    }

    buffer += ch;
  }

  if (buffer.trim()) {
    push(SPEECH_PAUSE.none);
  }

  return units;
}

function countEnglishWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function unitLength(text: string, lang: SpeechLang): number {
  return lang === 'zh-CN' ? text.length : countEnglishWords(text);
}

function isUnitTooShort(text: string, lang: SpeechLang): boolean {
  return unitLength(text, lang) < (lang === 'zh-CN' ? ZH_MIN_CHARS : EN_MIN_WORDS);
}

function isUnitTooLong(text: string, lang: SpeechLang): boolean {
  return unitLength(text, lang) > (lang === 'zh-CN' ? ZH_MAX_CHARS : EN_MAX_WORDS);
}

function findChinesePhraseBreak(text: string, start: number, maxEnd: number): number {
  const minEnd = start + ZH_MIN_CHARS;
  let best = -1;

  for (const token of ZH_BREAK_BEFORE) {
    let index = text.indexOf(token, minEnd);
    while (index >= 0 && index <= maxEnd) {
      best = Math.max(best, index);
      index = text.indexOf(token, index + token.length);
    }
  }

  for (const token of ZH_BREAK_AFTER) {
    let index = text.indexOf(token, minEnd);
    while (index >= 0 && index + token.length <= maxEnd) {
      best = Math.max(best, index + token.length);
      index = text.indexOf(token, index + token.length);
    }
  }

  return best >= minEnd ? best : -1;
}

function splitChinesePhrases(text: string, _finalPause: number): string[] {
  if (!isUnitTooLong(text, 'zh-CN')) return [text];

  const parts: string[] = [];
  let start = 0;
  let splits = 0;

  while (start < text.length && splits < MAX_PHRASE_SPLITS) {
    const remaining = text.length - start;
    if (remaining <= ZH_MAX_CHARS) break;

    const maxEnd = Math.min(start + ZH_MAX_CHARS, text.length);
    let breakAt = findChinesePhraseBreak(text, start, maxEnd);
    if (breakAt < 0) breakAt = maxEnd;

    const piece = text.slice(start, breakAt).trim();
    if (piece) parts.push(piece);
    start = breakAt;
    splits += 1;
  }

  const tail = text.slice(start).trim();
  if (tail) parts.push(tail);

  if (parts.length <= 1) return [text];

  const merged: string[] = [];
  for (const part of parts) {
    if (merged.length > 0 && isUnitTooShort(part, 'zh-CN')) {
      merged[merged.length - 1] += part;
    } else {
      merged.push(part);
    }
  }

  if (merged.length <= 1) return [text];
  return merged;
}

function splitEnglishPhrases(text: string, _finalPause: number): string[] {
  if (!isUnitTooLong(text, 'en-US')) return [text];

  const words = text.trim().split(/\s+/);
  if (words.length <= EN_MAX_WORDS) return [text];

  const parts: string[] = [];
  let bucket: string[] = [];
  let splits = 0;

  const flush = (): void => {
    if (bucket.length > 0) {
      parts.push(bucket.join(' '));
      bucket = [];
    }
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const lower = word.toLowerCase();

    if (
      bucket.length >= EN_MAX_WORDS ||
      (bucket.length >= EN_MIN_WORDS && EN_BREAK_WORDS.has(lower) && splits < MAX_PHRASE_SPLITS)
    ) {
      flush();
      splits += 1;
    }

    bucket.push(word);
  }

  flush();

  if (parts.length <= 1) return [text];

  const merged: string[] = [];
  for (const part of parts) {
    if (merged.length > 0 && isUnitTooShort(part, 'en-US')) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${part}`;
    } else {
      merged.push(part);
    }
  }

  if (merged.length <= 1) return [text];
  return merged;
}

function splitLongIntoPhrases(text: string, finalPause: number, lang: SpeechLang): SpeechUnit[] {
  const pieces = lang === 'zh-CN' ? splitChinesePhrases(text, finalPause) : splitEnglishPhrases(text, finalPause);

  if (pieces.length === 1) {
    return [{ text: pieces[0], pauseAfterMs: finalPause }];
  }

  return pieces.map((piece, index) => ({
    text: piece,
    pauseAfterMs: index < pieces.length - 1 ? SPEECH_PAUSE.phrase : finalPause,
  }));
}

/** Split into short units with pause metadata for natural rhythm. */
export function splitIntoSpeechUnits(
  text: string,
  lang: SpeechLang = detectDominantLanguage(text),
): SpeechUnit[] {
  const normalized = normalizeInputText(text);
  const rawUnits = splitByPunctuation(normalized);
  const result: SpeechUnit[] = [];
  const speechLang = normalizeSpeechLang(lang);

  for (const raw of rawUnits) {
    const spoken = prepareTextForSpeech(raw.text);
    if (!spoken || !isSpeechReadyText(spoken)) continue;

    result.push(...splitLongIntoPhrases(spoken, raw.pauseAfterMs, speechLang));
  }

  return result;
}

export function buildHttpSpeechText(
  text: string,
  lang: SpeechLang = detectDominantLanguage(text),
): string {
  const speechLang = normalizeSpeechLang(lang);
  const parts: string[] = [];
  for (const unit of splitIntoSpeechUnits(text, speechLang)) {
    parts.push(unit.text);
    if (unit.pauseAfterMs >= SPEECH_PAUSE.paragraph) {
      parts.push('\n\n');
    } else if (unit.pauseAfterMs >= SPEECH_PAUSE.sentence) {
      parts.push('\n');
    } else if (unit.pauseAfterMs >= SPEECH_PAUSE.clause) {
      parts.push('  ');
    } else if (unit.pauseAfterMs >= SPEECH_PAUSE.phrase) {
      parts.push(' ');
    }
  }
  return parts.join('').trim();
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
  if (isSkippablePunctuation(ch) || isSentenceDelimiter(ch) || isClauseDelimiter(ch)) return 'neutral';
  if (isCjkChar(ch)) return 'zh-CN';
  if (/[A-Za-z]/.test(ch)) return 'en-US';
  if (/\d/.test(ch)) return 'neutral';
  return 'neutral';
}

/** Split text into homogeneous zh/en segments so TTS won't mix accents. */
export function splitByLanguage(text: string): LanguageSegment[] {
  const normalized = normalizeInputText(text);
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
  preference: 'auto' | 'zh-CN' | 'en-US' = 'auto',
): 'zh-CN' | 'en-US' {
  if (preference === 'zh-CN' || preference === 'en-US') return preference;
  return detectDominantLanguage(text);
}

function normalizeSpeechLang(lang: SpeechLang | string | undefined): SpeechLang {
  return lang === 'en-US' ? 'en-US' : 'zh-CN';
}

export function splitTextIntoChunks(text: string, maxLength = MAX_CHUNK_LENGTH): string[] {
  const normalized = normalizeInputText(text);
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
    readSelection: '朗读选中内容',
    readStarted: '已开始朗读',
    noSelection: '请先在网页中选中文字',
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
    readSelection: 'Read selected text',
    readStarted: 'Reading started',
    noSelection: 'Select some text on the page first',
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
