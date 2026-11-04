import { categoryLabels, MAX_SCAN_REFERENCES, MAX_TRANSCRIPT_LENGTH } from './scanner.ts';
import type { ScanReport, SermonFinding } from './scanner.ts';

export type FindingReviewStatus = 'pending' | 'checked' | 'challenge' | 'dismissed';
export interface FindingReview { status: FindingReviewStatus; note: string; evidenceKey: string }
export interface EvidenceSession {
  schemaVersion: 1;
  id: string;
  title: string;
  transcript: string;
  createdAt: string;
  updatedAt: string;
  editionIds: string[];
  reviews: Record<string, FindingReview>;
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
const reviewStatuses: FindingReviewStatus[] = ['pending', 'checked', 'challenge', 'dismissed'];

export function validateSession(value: unknown): EvidenceSession {
  if (!object(value) || value.schemaVersion !== 1) throw new Error('This is not a supported sermon transcript backup.');
  if (typeof value.id !== 'string' || !/^[A-Za-z0-9-]{1,80}$/.test(value.id)) throw new Error('Invalid transcript session identity.');
  if (typeof value.title !== 'string' || value.title.length > 160 || typeof value.transcript !== 'string' || value.transcript.length > MAX_TRANSCRIPT_LENGTH) throw new Error('The transcript title or text exceeds the supported limit.');
  if (!validDate(value.createdAt) || !validDate(value.updatedAt) || !object(value.reviews) || Object.keys(value.reviews).length > MAX_SCAN_REFERENCES) throw new Error('The transcript backup has invalid dates or review notes.');
  const reviews: Record<string, FindingReview> = {};
  const editionIds = value.editionIds === undefined ? ['eng-web'] : value.editionIds;
  if (!Array.isArray(editionIds) || !editionIds.length || editionIds.length > 8 || editionIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id)) || new Set(editionIds).size !== editionIds.length) throw new Error('Invalid checked editions in transcript backup.');
  for (const [id, item] of Object.entries(value.reviews)) {
    if (!/^finding-\d+-\d+$/.test(id) || !object(item) || !reviewStatuses.includes(item.status as FindingReviewStatus) || typeof item.note !== 'string' || item.note.length > 4000 || typeof item.evidenceKey !== 'string' || item.evidenceKey.length > 2000 || !/^[a-f\d:|.-]+$/.test(item.evidenceKey)) throw new Error('A review note is malformed. Existing saved sessions have not been changed.');
    reviews[id] = { status: item.status as FindingReviewStatus, note: item.note, evidenceKey: item.evidenceKey };
  }
  return { schemaVersion: 1, id: value.id, title: value.title, transcript: value.transcript, createdAt: value.createdAt, updatedAt: value.updatedAt, editionIds, reviews };
}

export function evidenceKey(report: ScanReport, finding: SermonFinding): string {
  // User review stays attached to the exact transcript and exact compared source passages.
  return `${report.transcriptHash}:${finding.evidence.map(item => item.passageHash).join('|')}`;
}
export function currentReview(report: ScanReport, finding: SermonFinding, reviews: EvidenceSession['reviews']): FindingReview {
  const key = evidenceKey(report, finding), prior = reviews[finding.id];
  return prior?.evidenceKey === key ? prior : { status: 'pending', note: '', evidenceKey: key };
}

export function buildEvidenceReport(title: string, transcript: string, report: ScanReport, reviews: EvidenceSession['reviews']): string {
  const sections = [`ADIGUN-AIBIBLE — PRIVATE TRANSCRIPT EVIDENCE REPORT\n${title || 'Untitled transcript'}\nGenerated: ${report.createdAt}`, report.scope, `Transcript SHA-256: ${report.transcriptHash}`, 'CHECKED SOURCES\n' + report.checkedEditions.map(edition => `${edition.name} [${edition.id}]\n${edition.sourceUrl}${edition.editionHash ? `\nEdition source SHA-256: ${edition.editionHash}` : ''}`).join('\n\n'), 'These are deterministic word-comparison findings, not judgments about a speaker’s intent, doctrine or trustworthiness. Review decisions below are the user’s private assessments, not editorial approval.'];
  for (const [index, finding] of report.findings.entries()) {
    const review = currentReview(report, finding, reviews);
    sections.push(`FINDING ${index + 1}: ${categoryLabels[finding.category]}\nReference in transcript: ${finding.referenceSpan.text}\nTranscript character range: ${finding.transcriptSpan.start}–${finding.transcriptSpan.end}${finding.timestamp ? `\nSupplied timestamp: ${finding.timestamp.label}` : ''}\n\nTranscript span:\n${finding.transcriptSpan.text}\n\n${finding.explanation}\n\n${finding.uncertainty.map(item => `- ${item}`).join('\n')}\n\nPersonal review: ${review.status}${review.note ? `\nPersonal review note: ${review.note}` : ''}`);
    for (const evidence of finding.evidence) sections.push(`${evidence.label} — ${evidence.editionName}\n${evidence.verses.map(verse => `${verse.number}. ${verse.text}`).join('\n')}\n\nSurrounding context:\n${evidence.context.map(verse => `${verse.number}. ${verse.text || '[No main-text wording supplied at this position.]'}`).join('\n')}\n\n${evidence.attribution}\n${evidence.license}\n${evidence.licenseUrl}\n${evidence.sourceUrl}\nPassage SHA-256: ${evidence.passageHash}`);
  }
  sections.push(`ORIGINAL USER-SUPPLIED TRANSCRIPT\n${transcript}`);
  return sections.join('\n\n' + '—'.repeat(24) + '\n\n') + '\n';
}
