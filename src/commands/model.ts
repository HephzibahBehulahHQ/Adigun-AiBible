export interface PaletteCommand {
  id: string;
  label: string;
  description?: string;
  keywords?: string;
  disabled?: boolean;
  run: () => void;
}

/** Search normalization never changes the labels shown to the reader. */
export function normalizeCommandQuery(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/gu, ' ');
}

/** Stable relevance order; callbacks are never evaluated while searching. */
export function filterCommands(commands: readonly PaletteCommand[], query: string): PaletteCommand[] {
  const normalized = normalizeCommandQuery(query);
  if (!normalized) return [...commands];
  const terms = normalized.split(' ');
  return commands.map((command, index) => {
    const label = normalizeCommandQuery(command.label);
    const searchable = normalizeCommandQuery([command.label, command.description || '', command.keywords || ''].join(' '));
    const matches = terms.every(term => searchable.includes(term));
    const rank = label === normalized ? 0
      : label.startsWith(normalized) ? 1
      : terms.every(term => label.includes(term)) ? 2 : 3;
    return { command, index, matches, rank };
  }).filter(result => result.matches)
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(result => result.command);
}

export function firstEnabledCommand(commands: readonly PaletteCommand[]): PaletteCommand | undefined {
  return commands.find(command => !command.disabled);
}
