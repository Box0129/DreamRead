const NATURAL_HINTS = [
  'neural',
  'natural',
  'online',
  'google',
  'xiaoxiao',
  'xiaoyi',
  'yunxi',
  'yunyang',
  'jenny',
  'aria',
  'guy',
  'premium',
  'huihui',
  'kangkang',
  'yaoyao',
];

const ROBOTIC_HINTS = ['espeak', 'compact', 'diphone', 'mbrola'];

function scoreVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  let score = 0;
  for (const hint of NATURAL_HINTS) {
    if (name.includes(hint)) score += 10;
  }
  for (const hint of ROBOTIC_HINTS) {
    if (name.includes(hint)) score -= 20;
  }
  if (voice.localService) score += 1;
  if (name.includes('microsoft')) score += 2;
  return score;
}

export function waitForVoices(timeoutMs = 2500): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const existing = speechSynthesis.getVoices().filter(Boolean);
    if (existing.length > 0) {
      resolve(existing);
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(speechSynthesis.getVoices().filter(Boolean));
    };

    speechSynthesis.onvoiceschanged = finish;
    setTimeout(finish, timeoutMs);
  });
}

export function filterVoicesByLang(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice[] {
  const prefix = lang.slice(0, 2).toLowerCase();
  const matched = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  return matched.length > 0 ? matched : voices;
}

export function sortVoicesByQuality(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...voices].sort((a, b) => {
    const diff = scoreVoice(b) - scoreVoice(a);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}

export function pickVoiceForLang(
  voices: SpeechSynthesisVoice[],
  lang: string,
  preferredURI: string,
): SpeechSynthesisVoice | undefined {
  const pool = sortVoicesByQuality(filterVoicesByLang(voices, lang));
  if (pool.length === 0) return voices[0];

  if (preferredURI) {
    const matched = pool.find((v) => v.voiceURI === preferredURI || v.name === preferredURI);
    if (matched) return matched;
    const global = voices.find((v) => v.voiceURI === preferredURI || v.name === preferredURI);
    if (global) return global;
  }

  return pool[0];
}

export function voiceOptionLabel(voice: SpeechSynthesisVoice): string {
  const tag = scoreVoice(voice) >= 10 ? ' ★' : '';
  return `${voice.name} (${voice.lang})${tag}`;
}

export function defaultVoiceURI(voices: SpeechSynthesisVoice[], lang: string): string {
  return pickVoiceForLang(voices, lang, '')?.voiceURI ?? '';
}
