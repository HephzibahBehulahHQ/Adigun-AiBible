/// <reference lib="webworker" />
import { bibleEditionIds } from '../data';
import { getOfflineManifest } from '../offline';
import { requirePermission } from '../permissions';
import { createConcordanceEngine } from './engine.ts';
import type { ConcordanceRequest } from './engine.ts';
import { ConcordanceSourceLoader } from './source.ts';

const sources = new ConcordanceSourceLoader({
  installedBibleIds: bibleEditionIds,
  getInventory: getOfflineManifest,
  fetch: (url, options) => fetch(url, options),
  requirePermission,
});
const handle = createConcordanceEngine({
  loadSource: (editionId, baseUrl, signal, onStatus) => sources.load(editionId, baseUrl, signal, onStatus),
  post: message => self.postMessage(message),
  yieldControl: () => new Promise(resolve => setTimeout(resolve, 0)),
});
self.onmessage = ({ data }: MessageEvent<ConcordanceRequest>) => { void handle(data); };
