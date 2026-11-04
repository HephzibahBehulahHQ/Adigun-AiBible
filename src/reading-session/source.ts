import { getBook, getManifest } from '../data';
import type { Manifest, Reference } from '../types';
import type { ReadingSessionState } from './model';
import { checkReadingSessionSources, resolveReadingPassage } from './source-core';

const sources = { getBook, getManifest };
export const prepareReadingPassage = (reference: Reference, manifest?: Manifest, expectedSha256?: string) => resolveReadingPassage(reference, sources, manifest, expectedSha256);
export const prepareReadingSessionImport = (state: ReadingSessionState) => checkReadingSessionSources(state, sources);
