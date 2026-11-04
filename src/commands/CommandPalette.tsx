import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Search, X } from 'lucide-react';
import type { Manifest } from '../types';
import { workspaceCommands } from './model';
import type { WorkspaceCommand } from './model';
import './commands.css';

export default function CommandPalette({ manifest, focus, onClose, onRun }: {
  manifest: Manifest | null;
  focus: boolean;
  onClose: () => void;
  onRun: (command: WorkspaceCommand) => void;
}) {
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(0);
  const listId = useId(), input = useRef<HTMLInputElement>(null);
  const commands = useMemo(() => workspaceCommands(query, manifest?.books || [], manifest?.edition.id || '', focus, !!manifest), [query, manifest, focus]);
  const active = commands.length ? Math.min(selected, commands.length - 1) : -1;
  useEffect(() => { if (active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, listId]);
  return <div className="dialog-backdrop command-backdrop" onClick={onClose}>
    <section className="command-dialog" role="dialog" aria-modal="true" aria-labelledby={`${listId}-title`} tabIndex={-1} lang="en" onClick={event => event.stopPropagation()}>
      <header><div><span className="eyebrow">YOUR WORKSPACE</span><h2 id={`${listId}-title`}>Command palette</h2></div><button className="icon-button" aria-label="Close command palette" onClick={onClose}><X size={21}/></button></header>
      <label className="command-query" htmlFor={`${listId}-query`}><Search size={19}/><span className="sr-only">Find an action or passage</span><input
        id={`${listId}-query`} ref={input} data-dialog-autofocus role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={listId}
        aria-activedescendant={active < 0 ? undefined : `${listId}-${active}`} aria-describedby={`${listId}-help`} autoComplete="off" maxLength={200}
        value={query} onChange={event => { setQuery(event.target.value); setSelected(0); }} placeholder="Try John 3:16, notes, or layouts"
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (commands.length) setSelected((active + (event.key === 'ArrowDown' ? 1 : -1) + commands.length) % commands.length); }
          if (event.key === 'Home' && event.altKey) { event.preventDefault(); setSelected(0); }
          if (event.key === 'End' && event.altKey) { event.preventDefault(); setSelected(Math.max(0, commands.length - 1)); }
          if (event.key === 'Enter' && active >= 0) { event.preventDefault(); onRun(commands[active]); }
        }}/></label>
      <p className="command-help" id={`${listId}-help`}>↑ ↓ choose · Enter open · Escape close. Commands keep your passage and edition unless you enter another reference.</p>
      {!manifest && <p role="status" className="command-help">The selected source is not ready. Navigation remains available.</p>}
      <ul className="command-results" role="listbox" id={listId} aria-label="Available actions">
        {commands.map((command, index) => <li key={command.id} role="presentation"><button
          type="button" role="option" id={`${listId}-${index}`} aria-selected={active === index} tabIndex={-1}
          onMouseMove={() => setSelected(index)} onClick={() => onRun(command)}>
          <span><strong>{command.label}</strong><small>{command.detail}</small></span><ArrowUpRight size={18} aria-hidden="true"/>
        </button></li>)}
      </ul>
      {!commands.length && <p role="status">No matching action. Try another name or a passage reference.</p>}
      <footer>Actions stay local. Nothing is sent, shared or played automatically.</footer>
    </section>
  </div>;
}
