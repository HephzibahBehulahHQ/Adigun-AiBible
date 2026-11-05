import { resolveMinistrySource } from '../ministry/source-core.ts';
import type { MinistrySources, MinistrySourcePassage } from '../ministry/source-core';
import type { DictionaryId, Lexicon, LexiconEntry } from './lexicon';
import { validateExperiment } from './model.ts';
import type { LinguisticsState, TranslationExperiment } from './model';
export interface LinguisticsSources extends MinistrySources { getLexicon: (id: DictionaryId) => Promise<Lexicon> }
export async function resolveExperiment(value: TranslationExperiment, sources: LinguisticsSources): Promise<{ entry: LexiconEntry; context: MinistrySourcePassage }> {
  const experiment = validateExperiment(value), lexicon = await sources.getLexicon(experiment.dictionaryId);
  const entry = lexicon.entries.find(row => row.id === experiment.entryId);
  if (!entry?.lemma || lexicon.sourceSha256 !== experiment.dictionarySourceSha256 || entry.entrySha256 !== experiment.entrySha256) throw new Error('The original dictionary entry or source revision is unavailable. No newer definition has been substituted.');
  const context = await resolveMinistrySource(experiment.passage.reference, sources, experiment.passage.sourceSha256);
  if (context.passage.editionName !== experiment.passage.editionName || context.passage.bookName !== experiment.passage.bookName) throw new Error('The saved Bible edition or book label differs from its exact source.');
  return { entry, context };
}
export async function verifyLinguisticsImport(value: LinguisticsState, sources: LinguisticsSources): Promise<void> { for (const experiment of value.experiments) await resolveExperiment(experiment, sources); }
