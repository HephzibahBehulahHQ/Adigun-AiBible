import { sourceDirection, sourceFont, sourceLineHeight } from './source-typography.ts';
import { wrapExactText } from './exact-text-wrap.ts';
import type { Verse } from './types';
export type CardSize = 'story' | 'square' | 'portrait';
export const dimensions = { story: [1080, 1920], square: [1080, 1080], portrait: [1080, 1350] } as const;
export const palettes = { gold: { background: '#0B1220', ink: '#F8FAFC', accent: '#D4AF37' }, ivory: { background: '#F8FAFC', ink: '#15243A', accent: '#795F1E' }, paper: { background: '#F2E8D3', ink: '#342B22', accent: '#78501E' }, night: { background: '#080E18', ink: '#D7E0EF', accent: '#92B5ED' } };
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []; let line = '';
  for (const word of text.split(/\s+/u)) {
    if (ctx.measureText(word).width > maxWidth) throw new Error('A word exceeds the safe text width. Choose a larger card.');
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth) { lines.push(line); line = word; } else line = candidate;
  }
  if (line) lines.push(line); return lines;
}
export function drawShareCard(canvas: HTMLCanvasElement, verses: Verse[], reference: string, edition: string, size: CardSize, palette: keyof typeof palettes, rightsNotice = 'Source Scripture · Public domain', language = 'en') {
  const [width, height] = dimensions[size]; canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image export is not supported in this browser.');
  ctx.direction = 'ltr'; ctx.textAlign = 'left';
  const colors = palettes[palette]; ctx.fillStyle = colors.background; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = colors.accent; ctx.globalAlpha = .18;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(width - 40, 100, 180 + i * 65, 180 + i * 65, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.fillStyle = colors.accent; ctx.font = '600 23px system-ui'; ctx.fillText('ADIGUN–AIBIBLE  /  HB EVANGELISM', 96, 145);
  ctx.font = '18px system-ui';
  const creditLines = wrapText(ctx, rightsNotice, width - 192);
  const footerTop = height - 70 - creditLines.length * 25;
  const text = verses.map(v => v.text).join(' '); let font = size === 'story' ? 64 : 52; let lines: string[] = [];
  const top = height * .22, bottom = Math.min(height - 300, footerTop - 195);
  for (; font >= 30; font -= 2) { ctx.font = `${font}px ${sourceFont(language)}`; lines = wrapExactText(text, width - 192, value => ctx.measureText(value).width); if (lines.length * font * sourceLineHeight(language) <= bottom - top) break; }
  if (font < 30 || lines.length * font * sourceLineHeight(language) > bottom - top) throw new Error('This passage is too long for a legible card. Select fewer verses or choose Story. Nothing has been cropped.');
  ctx.fillStyle = colors.ink;
  const direction = sourceDirection(language); ctx.direction = direction; ctx.textAlign = direction === 'rtl' ? 'right' : 'left';
  lines.forEach((line, i) => ctx.fillText(line.replace(/[\r\n]+$/g, ''), direction === 'rtl' ? width - 96 : 96, top + i * font * sourceLineHeight(language)));
  ctx.direction = 'ltr'; ctx.textAlign = 'left';
  const ruleY = Math.min(bottom + 60, top + lines.length * font * sourceLineHeight(language) + 65);
  ctx.fillStyle = colors.accent; ctx.fillRect(96, ruleY, 66, 3); ctx.font = '600 32px system-ui'; ctx.fillText(reference, 96, ruleY + 68);
  ctx.fillStyle = colors.ink; ctx.font = '22px system-ui'; ctx.fillText(edition, 96, ruleY + 108);
  ctx.globalAlpha = .8; ctx.font = '18px system-ui'; creditLines.forEach((line,i)=>ctx.fillText(line,96,footerTop+i*25)); ctx.globalAlpha = 1;
  return canvas;
}
export function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
export async function saveCanvas(canvas: HTMLCanvasElement) { const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not create image.')), 'image/png')); downloadBlob(blob, 'Adigun-AiBible-passage.png'); }
export async function recordCard(canvas: HTMLCanvasElement, onProgress: (seconds: number) => void, signal: AbortSignal) {
  if (!canvas.captureStream || typeof MediaRecorder === 'undefined') throw new Error('Video export is not supported. Download the PNG instead.');
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mime) throw new Error('This browser cannot export WebM. Download a PNG instead.');
  const stream = canvas.captureStream(10); const recorder = new MediaRecorder(stream, { mimeType: mime }); const chunks: BlobPart[] = [];
  await new Promise<void>((resolve, reject) => {
    let seconds = 0;
    const timer = setInterval(() => { seconds++; onProgress(seconds); if (seconds >= 15 && recorder.state !== 'inactive') recorder.stop(); }, 1000);
    const abort = () => { if (recorder.state !== 'inactive') recorder.stop(); };
    signal.addEventListener('abort', abort, { once: true });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => { clearInterval(timer); signal.removeEventListener('abort', abort); stream.getTracks().forEach(t => t.stop()); if (signal.aborted) reject(new Error('Video export cancelled.')); else resolve(); };
    recorder.onerror = () => { clearInterval(timer); stream.getTracks().forEach(t => t.stop()); reject(new Error('Video encoding failed.')); };
    recorder.start(100);
  });
  const blob = new Blob(chunks, { type: mime }); if (!blob.size) throw new Error('The video is empty. Use PNG export.'); downloadBlob(blob, 'Adigun-AiBible-passage.webm');
}
