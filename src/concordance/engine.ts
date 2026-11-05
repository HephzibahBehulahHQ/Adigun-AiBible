import { countConcordance, validateConcordanceQuery } from './model.ts';
import type { ConcordanceQuery, ConcordanceResult, ConcordanceSource } from './model.ts';

export type ConcordanceRequest = { type: 'cancel' } | {
  type: 'search'; id: number; editionId: string; baseUrl: string; query: ConcordanceQuery; page: number;
};
export type ConcordanceResponse =
  | { type: 'progress'; id: number; message: string }
  | { type: 'result'; id: number; result: ConcordanceResult }
  | { type: 'error'; id: number; error: string };
export interface ConcordanceEngineServices {
  loadSource: (editionId: string, baseUrl: string, signal: AbortSignal, onStatus: (message: string) => void) => Promise<ConcordanceSource>;
  post: (message: ConcordanceResponse) => void;
  yieldControl: () => Promise<void>;
}

/** Cancellation aborts fetch/counting; generation identity also rejects late non-abortable work. */
export function createConcordanceEngine(services: ConcordanceEngineServices) {
  let active: { id: number; controller: AbortController } | null = null;
  return async (request: ConcordanceRequest): Promise<void> => {
    if (!request || !['search', 'cancel'].includes(request.type)) return;
    active?.controller.abort(); active = null;
    if (request.type === 'cancel') return;
    if (!Number.isSafeInteger(request.id) || request.id < 1) return;
    const task = { id: request.id, controller: new AbortController() }; active = task;
    const current = () => active === task && !task.controller.signal.aborted;
    const status = (message: string) => { if (current()) services.post({ type: 'progress', id: request.id, message }); };
    try {
      validateConcordanceQuery(request.query);
      const source = await services.loadSource(request.editionId, request.baseUrl, task.controller.signal, status);
      if (!current()) return;
      const result = await countConcordance(source, request.query, request.page, {
        signal: task.controller.signal, yieldControl: services.yieldControl,
        onProgress: (processed, total) => { if (processed % 1_000 === 0) status(`Counting complete source records: ${processed.toLocaleString('en')} of ${total.toLocaleString('en')} checked…`); },
      });
      if (current()) services.post({ type: 'result', id: request.id, result });
    } catch (error) {
      if (current()) services.post({ type: 'error', id: request.id, error: error instanceof Error ? error.message : 'Concordance is unavailable. No verified count was produced.' });
    } finally { if (active === task) active = null; }
  };
}
