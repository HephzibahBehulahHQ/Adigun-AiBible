import { useState } from 'react';
import type { FormEvent } from 'react';
import { createInterpretationChallenge, explicitReference, newEntryBase, referenceLabel } from './model';
import { createDecisionSimulationReflection, decisionSimulation, decisionSimulations, decisionSimulationReferences, getDecisionSimulation } from './decision-simulation';
import { createDetectiveMissionReflection, detectiveMission, detectiveMissionReferences } from './detective-mission';
import type { QuestionState, ReflectionEntry, ReflectionKind, WorkspaceState } from './model';
import type { WorkspaceChange } from './useWorkspace';
import { PassageLinks } from './shared';
import type { WorkspaceProps } from './shared';
const labels: Record<ReflectionKind, string> = { question: 'Question journal', interpretation: 'Interpretation timeline', application: 'Application notebook', reconciliation: 'Reconciliation reflection' };
const prompts: Record<ReflectionKind, string> = {
  question: 'What is your question? Which passages or sources have you examined? What would help you research it further?',
  interpretation: 'What do you understand now? What changed from an earlier interpretation? Record your reasons and the sources that influenced you.',
  application: 'What is one action you choose to take? What context, limits or responsibilities should you consider? Revisit it in your own words.',
  reconciliation: 'Describe what happened and its impact. What would you like to acknowledge? Which boundary or next step is within your control? Contact with another person is optional.'
};
const blank = { title: '', text: '', reason: '', sources: '', linkPassage: false, kind: 'question' as ReflectionKind, state: 'unresolved' as QuestionState };
const blankChallenge = { observation:'', context:'', alternatives:'', uncertainty:'', sources:'' };
export default function ReflectionsTab({ state, busy, commit, reference, onOpenReference }: WorkspaceProps & { state: WorkspaceState; busy: boolean; commit: WorkspaceChange }) {
  const [draft, setDraft] = useState(blank); const [editing, setEditing] = useState<ReflectionEntry | null>(null); const [search, setSearch] = useState(''); const [kindFilter, setKindFilter] = useState('all');
  const [challengeOpen,setChallengeOpen]=useState(false),[challenge,setChallenge]=useState(blankChallenge),[challengeError,setChallengeError]=useState('');
  const [decisionOpen,setDecisionOpen]=useState(false),[decisionChoice,setDecisionChoice]=useState(''),[decisionReflection,setDecisionReflection]=useState(''),[decisionError,setDecisionError]=useState(''),[decisionScenarioId,setDecisionScenarioId]=useState<string>(decisionSimulation.id);
  const [detectiveOpen,setDetectiveOpen]=useState(false),[detectiveIndex,setDetectiveIndex]=useState(0),[detectiveSolved,setDetectiveSolved]=useState<string[]>([]),[detectiveChoice,setDetectiveChoice]=useState(''),[detectiveHint,setDetectiveHint]=useState(false),[detectiveFeedback,setDetectiveFeedback]=useState(''),[detectiveError,setDetectiveError]=useState('');
  const activeDetectiveClue=detectiveMission.clues[detectiveIndex],detectiveComplete=detectiveSolved.length===detectiveMission.clues.length;
  const reset = () => { setEditing(null); setDraft(blank); };
  async function saveChallenge(event:FormEvent) {
    event.preventDefault(); setChallengeError('');
    try {
      const entry=createInterpretationChallenge(reference,challenge);
      if(await commit(s=>({...s,reflections:[entry,...s.reflections]}))) { setChallenge(blankChallenge);setChallengeOpen(false); }
    } catch(error) { setChallengeError(error instanceof Error?error.message:'Could not save this interpretation challenge.'); }
  }
  async function saveDecisionSimulation(event:FormEvent) {
    event.preventDefault();setDecisionError('');
    try {
      const entry=createDecisionSimulationReflection(decisionChoice,decisionReflection,reference.editionId||'eng-web',new Date(),decisionScenarioId);
      if(await commit(s=>({...s,reflections:[entry,...s.reflections]}))) {setDecisionOpen(false);setDecisionChoice('');setDecisionReflection('');}
    } catch(error) {setDecisionError(error instanceof Error?error.message:'Could not save this decision simulation.');}
  }
  function startDetectiveMission() {setDetectiveOpen(true);setDetectiveIndex(0);setDetectiveSolved([]);setDetectiveChoice('');setDetectiveHint(false);setDetectiveFeedback('');setDetectiveError('');}
  function checkDetectiveClue() {
    if(!detectiveChoice){setDetectiveFeedback('Choose an answer, then check the passage evidence.');return;}
    if(detectiveChoice===activeDetectiveClue.answerId) {
      setDetectiveSolved(value=>value.includes(activeDetectiveClue.id)?value:[...value,activeDetectiveClue.id]);
      setDetectiveFeedback(`Clue solved. ${activeDetectiveClue.evidence}`);
    } else setDetectiveFeedback('Not yet. Reopen the cited passage and try another answer.');
  }
  async function saveDetectiveMission() {
    setDetectiveError('');
    try {
      const entry=createDetectiveMissionReflection(reference.editionId||'eng-web',detectiveSolved.length);
      if(await commit(s=>({...s,reflections:[entry,...s.reflections]}))) {setDetectiveOpen(false);setDetectiveIndex(0);setDetectiveSolved([]);setDetectiveChoice('');setDetectiveFeedback('');}
    } catch(error) {setDetectiveError(error instanceof Error?error.message:'Could not save this mission result.');}
  }
  async function save(event: FormEvent) { event.preventDefault(); const at = new Date().toISOString(); const refs = [...(editing?.refs || [])]; const selected = explicitReference(reference); if (draft.linkPassage && !refs.some(r => referenceLabel(r) === referenceLabel(selected))) refs.push(selected);
    const entry: ReflectionEntry = { ...(editing || newEntryBase()), title: draft.title.trim(), kind: draft.kind, state: draft.state, text: draft.text, reason: draft.reason, refs, sources: [...new Set(draft.sources.split('\n').map(s => s.trim()).filter(Boolean))], updatedAt: at, history: editing ? [...editing.history, { at: editing.updatedAt, text: editing.text, reason: editing.reason, state: editing.state, refs: editing.refs, sources: editing.sources }].slice(-50) : [] };
    if (await commit(s => { if (editing && s.reflections.find(r => r.id === editing.id)?.updatedAt !== editing.updatedAt) throw new Error('This reflection changed since editing began. Cancel and reopen its newest version; your draft is still here.'); return { ...s, reflections: editing ? s.reflections.map(r => r.id === editing.id ? entry : r) : [entry, ...s.reflections] }; })) reset();
  }
  const activeDecisionSimulation = getDecisionSimulation(decisionScenarioId);
  const query = search.trim().toLocaleLowerCase(); const entries = state.reflections.filter(r => (kindFilter === 'all' || r.kind === kindFilter) && [r.title, r.text, r.reason, r.state, r.sources.join(' '), r.refs.map(referenceLabel).join(' ')].join(' ').toLocaleLowerCase().includes(query)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return <section aria-labelledby="reflections-heading"><h2 id="reflections-heading">Questions and reflections</h2><p className="muted">A private record of your questions, understanding and chosen actions. Status labels are yours; they are not editorial approval or an AI judgment.</p>
    <section className="workspace-card interpretation-challenge" aria-labelledby="interpretation-challenge-title">
      <div className="heading-with-actions"><div><p className="workspace-meta">GUIDED STUDY EXERCISE</p><h3 id="interpretation-challenge-title">Interpretation challenge</h3></div>{!challengeOpen&&<button type="button" className="secondary" disabled={busy} onClick={()=>{setChallengeError('');setChallengeOpen(true);}}>Start challenge</button>}</div>
      <p className="workspace-help">Work from the selected passage. Notice the wording, examine context, consider another plausible reading, and name what remains uncertain. This is a learning exercise—not Scripture, a score, or a verdict about faith. There is no automatic right-answer judgment.</p>
      <PassageLinks refs={[explicitReference(reference)]} onOpenReference={onOpenReference}/>
      {challengeOpen&&<form onSubmit={saveChallenge}><fieldset disabled={busy}>
        <label>1. Observation — what does the passage explicitly say?<textarea required rows={3} maxLength={4000} value={challenge.observation} onChange={e=>setChallenge(value=>({...value,observation:e.target.value}))}/></label>
        <label>2. Context — what details around the passage matter?<textarea rows={3} maxLength={4000} value={challenge.context} onChange={e=>setChallenge(value=>({...value,context:e.target.value}))}/></label>
        <label>3. Alternative readings — what other reasonable interpretation should be considered?<textarea rows={3} maxLength={4000} value={challenge.alternatives} onChange={e=>setChallenge(value=>({...value,alternatives:e.target.value}))}/></label>
        <label>4. Uncertainty — what remains unresolved?<textarea rows={3} maxLength={4000} value={challenge.uncertainty} onChange={e=>setChallenge(value=>({...value,uncertainty:e.target.value}))}/></label>
        <label>Sources considered (optional, one per line)<textarea rows={2} maxLength={4000} value={challenge.sources} onChange={e=>setChallenge(value=>({...value,sources:e.target.value}))}/></label>
        {challengeError&&<p className="workspace-error" role="alert">{challengeError}</p>}
        <div className="button-row"><button type="submit" className="primary">Save private challenge</button><button type="button" disabled={busy} onClick={()=>{setChallenge(blankChallenge);setChallengeError('');setChallengeOpen(false);}}>Cancel</button></div>
      </fieldset></form>}
    </section>
    <section className="workspace-card decision-simulation" aria-labelledby="decision-simulation-title">
      <div className="heading-with-actions"><div><p className="workspace-meta">FICTIONAL LEARNING EXERCISE · ENGLISH PILOT · ADULT STUDY USE</p><h3 id="decision-simulation-title">Decision simulation: {activeDecisionSimulation.title}</h3></div>{!decisionOpen&&<button type="button" className="secondary" disabled={busy} onClick={()=>{setDecisionError('');setDecisionOpen(true);}}>Start simulation</button>}</div>
      <p className="workspace-help">This is an illustrative scenario, not Scripture or a prediction. Choices are not scored, and no choice is treated as a verdict about faith or divine approval.</p>
      <label>Choose a scenario<select aria-label="Decision scenario" value={decisionScenarioId} disabled={decisionOpen || busy} onChange={e=>{setDecisionScenarioId(e.target.value);setDecisionChoice('');setDecisionReflection('');setDecisionError('');}}>{decisionSimulations.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      {decisionOpen&&<div>
        <p>{activeDecisionSimulation.situation}</p>
        <h4>Consider before choosing</h4><ul>{activeDecisionSimulation.considerations.map(item=><li key={item}>{item}</li>)}</ul>
        <h4>Relevant passages in the selected edition</h4><PassageLinks refs={decisionSimulationReferences(reference.editionId||'eng-web',decisionScenarioId)} onOpenReference={onOpenReference}/>
        <h4>Possible follow-up actions</h4><ul>{activeDecisionSimulation.followUps.map(item=><li key={item}>{item}</li>)}</ul>
        <form onSubmit={saveDecisionSimulation}><fieldset disabled={busy}>
          <legend>What would you do?</legend>
          {activeDecisionSimulation.choices.map(choice=><label className="workspace-check" key={choice.id}><input type="radio" name="decision-simulation-choice" value={choice.id} required checked={decisionChoice===choice.id} onChange={()=>{setDecisionChoice(choice.id);setDecisionError('');}}/><span>{choice.label}</span></label>)}
          {decisionChoice&&<section className="workspace-card" aria-live="polite"><h4>A plausible consequence — not a prediction</h4><p>{activeDecisionSimulation.choices.find(choice=>choice.id===decisionChoice)?.consequence}</p></section>}
          <label>{activeDecisionSimulation.reflectionPrompt}<textarea rows={4} maxLength={5000} required value={decisionReflection} onChange={e=>setDecisionReflection(e.target.value)}/></label>
          {decisionError&&<p className="workspace-error" role="alert">{decisionError}</p>}
          <div className="button-row"><button type="submit" className="primary" disabled={!decisionChoice}>Save private reflection</button><button type="button" disabled={busy} onClick={()=>{setDecisionChoice('');setDecisionReflection('');setDecisionError('');}}>Replay</button><button type="button" disabled={busy} onClick={()=>{setDecisionOpen(false);setDecisionChoice('');setDecisionReflection('');setDecisionError('');}}>Cancel</button></div>
        </fieldset></form>
      </div>}
    </section>
    <section className="workspace-card detective-mission" aria-labelledby="detective-mission-title">
      <div className="heading-with-actions"><div><p className="workspace-meta">SCRIPTURE EVIDENCE MISSION · ENGLISH PILOT · ADULT STUDY USE</p><h3 id="detective-mission-title">{detectiveMission.title}</h3></div>{!detectiveOpen&&<button type="button" className="secondary" disabled={busy} onClick={startDetectiveMission}>Start detective mission</button>}</div>
      <p className="workspace-help">{detectiveMission.introduction} Clue progress measures passage comprehension only; it is not a faith score or spiritual ranking.</p>
      {detectiveOpen&&<div>
        <p className="workspace-meta">Clue {detectiveIndex+1} of {detectiveMission.clues.length} · {detectiveSolved.length}/{detectiveMission.clues.length} solved</p>
        {detectiveComplete?<div aria-live="polite"><h4>Mission complete</h4><p>All five evidence clues are solved. Review the linked passages and save your result privately if you want to keep it.</p><div className="button-row"><button type="button" className="primary" disabled={busy} onClick={saveDetectiveMission}>Save private mission result</button><button type="button" disabled={busy} onClick={startDetectiveMission}>Replay mission</button></div></div>:<form onSubmit={e=>{e.preventDefault();checkDetectiveClue();}}><fieldset disabled={busy}>
          <h4>{activeDetectiveClue.question}</h4>
          <div role="group" aria-label="Answer choices">{activeDetectiveClue.options.map(option=><label className="workspace-check" key={option.id}><input type="radio" name="detective-answer" value={option.id} checked={detectiveChoice===option.id} onChange={()=>{setDetectiveChoice(option.id);setDetectiveFeedback('');}}/><span>{option.label}</span></label>)}</div>
          <div className="button-row"><button type="submit" className="primary">Check answer</button><button type="button" onClick={()=>setDetectiveHint(value=>!value)}>{detectiveHint?'Hide hint':'Show hint'}</button></div>
          {detectiveHint&&<p className="workspace-help">{activeDetectiveClue.hint}</p>}
          <h4>Source evidence in the selected edition</h4><PassageLinks refs={detectiveMissionReferences(reference.editionId||'eng-web',activeDetectiveClue.id)} onOpenReference={onOpenReference}/>
          {detectiveFeedback&&<p role="status" aria-live="polite">{detectiveFeedback}</p>}
          {detectiveSolved.includes(activeDetectiveClue.id)&&<button type="button" className="secondary" onClick={()=>{setDetectiveIndex(index=>Math.min(index+1,detectiveMission.clues.length-1));setDetectiveChoice('');setDetectiveHint(false);setDetectiveFeedback('');}}>Next clue</button>}
        </fieldset></form>}
        {detectiveError&&<p className="workspace-error" role="alert">{detectiveError}</p>}
        {!detectiveComplete&&<button type="button" disabled={busy} onClick={startDetectiveMission}>Restart mission</button>}
      </div>}
    </section><div className="workspace-columns"><form className="workspace-card" onSubmit={save}><h3>{editing ? 'Edit your reflection' : 'Write a reflection'}</h3><fieldset disabled={busy}><label>Reflection type<select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as ReflectionKind })}>{Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><p className="workspace-help">{prompts[draft.kind]}</p><label htmlFor="reflection-title">Title<input id="reflection-title" required maxLength={200} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label><label>Your writing<textarea rows={6} maxLength={20000} value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} /></label><label>My current status<select value={draft.state} onChange={e => setDraft({ ...draft, state: e.target.value as QuestionState })}><option value="unresolved">Unresolved</option><option value="researched">Researched</option><option value="revisited">Revisited</option><option value="answered">Answered, in my own judgment</option></select></label><label>{editing?.title.startsWith('Interpretation challenge ·') ? 'What remains uncertain' : 'My reason for a change in understanding'}<textarea rows={3} maxLength={20000} value={draft.reason} onChange={e => setDraft({ ...draft, reason: e.target.value })} /></label><label>Sources I considered, one per line<textarea rows={3} maxLength={20000} value={draft.sources} onChange={e => setDraft({ ...draft, sources: e.target.value })} /></label><label className="workspace-check"><input type="checkbox" checked={draft.linkPassage} onChange={e => setDraft({ ...draft, linkPassage: e.target.checked })} /><span>Link {referenceLabel(reference)}</span></label>{editing && <PassageLinks refs={editing.refs} onOpenReference={onOpenReference} />}<div className="button-row"><button type="submit" className="primary">{editing ? 'Save reflection changes' : 'Save reflection'}</button>{editing && <button type="button" onClick={reset}>Cancel edit</button>}</div><p className="workspace-help">This form remains unsaved until you choose Save.</p></fieldset></form><div><label className="workspace-search">Search private reflections<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label><label>Reflection filter<select value={kindFilter} onChange={e => setKindFilter(e.target.value)}><option value="all">All reflections</option>{Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><div className="workspace-list">{entries.map(entry => <article key={entry.id} className="workspace-card"><p className="workspace-meta">{labels[entry.kind]}</p><h3>{entry.title}</h3><p><strong>My status:</strong> {entry.state}</p><p className="workspace-writing">{entry.text}</p>{entry.reason && <><h4>{entry.title.startsWith('Interpretation challenge ·') ? 'What remains uncertain' : 'My reason for change'}</h4><p className="workspace-writing">{entry.reason}</p></>}<PassageLinks refs={entry.refs} onOpenReference={onOpenReference} />{entry.sources.length > 0 && <><h4>Sources I considered</h4><ul>{entry.sources.map((source, i) => <li className="workspace-meta" key={i}>{source}</li>)}</ul></>}<p className="workspace-meta">Updated {new Date(entry.updatedAt).toLocaleString()}</p>{entry.history.length > 0 && <details><summary>Earlier understanding ({entry.history.length})</summary>{entry.history.slice().reverse().map((version, i) => <div className="workspace-history" key={`${version.at}-${i}`}><time dateTime={version.at}>{new Date(version.at).toLocaleString()}</time><p>My status then: {version.state}</p><p className="workspace-writing">{version.text}</p>{version.reason && <p className="workspace-writing">Reason: {version.reason}</p>}<PassageLinks refs={version.refs} onOpenReference={onOpenReference} />{version.sources.length > 0 && <ul>{version.sources.map((source, index) => <li key={index}>{source}</li>)}</ul>}</div>)}</details>}<div className="button-row"><button type="button" disabled={busy} aria-label={`Edit reflection: ${entry.title}`} onClick={() => { setEditing(entry); setDraft({ title: entry.title, text: entry.text, reason: entry.reason, kind: entry.kind, state: entry.state, sources: entry.sources.join('\n'), linkPassage: false }); document.getElementById('reflection-title')?.focus(); }}>Edit</button><button type="button" disabled={busy} aria-label={`Delete reflection: ${entry.title}`} onClick={async () => { if (await commit(s => ({ ...s, reflections: s.reflections.filter(r => r.id !== entry.id) })) && editing?.id === entry.id) reset(); }}>Delete</button></div></article>)}</div>{!entries.length && <p className="workspace-empty">{state.reflections.length ? 'No reflections match these filters.' : 'Your reflection timeline begins with your own first entry.'}</p>}</div></div></section>;
}
