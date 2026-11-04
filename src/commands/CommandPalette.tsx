import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { filterCommands, firstEnabledCommand } from './model';
import type { PaletteCommand } from './model';
import './commands.css';

export type { PaletteCommand } from './model';

export default function CommandPalette({ commands, onClose }: {
  commands: PaletteCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const results = useMemo(() => filterCommands(commands, query), [commands, query]);

  function run(command: PaletteCommand) {
    if (command.disabled) return;
    onClose();
    command.run();
  }

  function handleKeys(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.key === 'Process'
      || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    const target = event.target;
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>('button[data-command-id]:not(:disabled)') || [])];
    if (target === search.current) {
      if (event.key === 'Enter') {
        event.preventDefault();
        const first = firstEnabledCommand(results);
        if (first) run(first);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!buttons.length) return;
        event.preventDefault();
        (event.key === 'ArrowDown' ? buttons[0] : buttons[buttons.length - 1]).focus();
      }
      return;
    }
    if (!(target instanceof HTMLButtonElement)) return;
    const index = buttons.indexOf(target);
    if (index < 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (index === 0) search.current?.focus();
      else buttons[index - 1]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      (event.key === 'Home' ? buttons[0] : buttons[buttons.length - 1])?.focus();
    }
  }

  return <div className="dialog-backdrop command-backdrop" onClick={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="command-dialog" role="dialog" aria-modal="true"
      aria-labelledby="command-palette-title" aria-describedby="command-palette-help"
      tabIndex={-1} onKeyDown={handleKeys}>
      <header className="command-heading">
        <div><span className="eyebrow">QUICK NAVIGATION</span><h2 id="command-palette-title">Command palette</h2></div>
        <button type="button" className="command-close" aria-label="Close command palette" onClick={onClose}>Close</button>
      </header>
      <label className="command-search-label" htmlFor="command-search">Find a command</label>
      <input ref={search} id="command-search" data-command-search type="search" value={query}
        autoComplete="off" spellCheck={false} maxLength={200}
        placeholder="Reader, notes, appearance…"
        aria-controls="command-results" aria-describedby="command-palette-help"
        onChange={event => setQuery(event.target.value)}/>
      <p id="command-palette-help" className="command-help">Type to filter. Use the arrow keys to explore, Enter to run, and Escape to close.</p>
      <p className="command-count" role="status" aria-live="polite" aria-atomic="true">
        {results.length === 0 ? 'No matching commands. Try another word.' : `${results.length} matching command${results.length === 1 ? '' : 's'}.`}
      </p>
      <ul ref={list} id="command-results" className="command-results" aria-label="Matching commands">
        {results.map(command => <li key={command.id}>
          <button type="button" data-command-id={command.id} disabled={command.disabled}
            onClick={() => run(command)}>
            <span className="command-label">{command.label}</span>
            {command.description && <span className="command-description">{command.description}</span>}
            {command.disabled && <span className="command-unavailable">Currently unavailable</span>}
          </button>
        </li>)}
      </ul>
    </section>
  </div>;
}
