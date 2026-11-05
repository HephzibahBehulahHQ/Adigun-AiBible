/** Typography never rewrites source characters or chooses a different edition. */
const primaryLanguage = (language?: string): string => (language || '').toLowerCase().split('-')[0];
const rtl = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'syr', 'dv']);
export const LATIN_SOURCE_FONT = 'Georgia, "Times New Roman", serif';
export function sourceDirection(language?: string): 'rtl' | 'ltr' {
  if (language?.split('-').some(part => /^(latn|cyrl)$/i.test(part))) return 'ltr';
  return rtl.has(primaryLanguage(language)) ? 'rtl' : 'ltr';
}
export function sourceFont(language?: string): string {
  const primary = primaryLanguage(language);
  return primary === 'ar' ? '"Adigun Naskh", serif' : primary === 'my' ? '"Adigun Myanmar", sans-serif' : LATIN_SOURCE_FONT;
}
export function sourceLineHeight(language?: string): number {
  return ['ar', 'my'].includes(primaryLanguage(language)) ? 1.8 : 1.48;
}
export const sourceFontFaces = `@font-face{font-family:"Adigun Naskh";src:url("${new URL('./assets/fonts/NotoNaskhArabic.ttf', import.meta.url).href}") format("truetype");font-weight:400 700;font-display:swap}@font-face{font-family:"Adigun Myanmar";src:url("${new URL('./assets/fonts/NotoSansMyanmar.ttf', import.meta.url).href}") format("truetype");font-weight:100 900;font-display:swap}`;

/** Canvas and print layout must measure the bundled font, never a pending fallback. */
export async function ensureSourceFont(language: string | undefined, text: string, target: Document = document): Promise<void> {
  const primary = primaryLanguage(language);
  if (!['ar', 'my'].includes(primary)) return;
  if (!target.fonts) throw new Error('This browser cannot verify the source font. Open the source reader or use a newer browser.');
  const font = `400 24px ${sourceFont(language)}`, sample = text.slice(0,4096) || (primary === 'ar' ? 'الكتاب' : 'မြန်မာ');
  const loaded = await target.fonts.load(font, sample);
  if (!loaded.length || loaded.some(face => face.status !== 'loaded') || !target.fonts.check(font, sample)) throw new Error('The bundled source font is unavailable. Reconnect to download the application fonts, then try again.');
}
