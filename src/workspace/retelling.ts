export const retellingPrompts = [
  'What happens in this passage?',
  'Who is involved, and what do they do?',
  'What changes from the beginning to the end?',
  'What detail or question do I want to remember?',
] as const;

/** Add an optional reflection scaffold without discarding a person's existing draft. */
export function appendRetellingPrompts(draft: string): string {
  const scaffold = retellingPrompts.map(prompt => `${prompt}\n`).join('\n');
  const current = draft.trimEnd();
  return current ? `${current}\n\n${scaffold}` : scaffold;
}
