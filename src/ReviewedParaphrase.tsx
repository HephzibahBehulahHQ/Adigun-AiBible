import { useEffect, useMemo, useState } from 'react';
import { refKey } from './domain';
import { paraphraseEvidenceMatches, selectApprovedParaphrase } from './publication';
import type { PublishedEditorial } from './publication';
import type { EditorialContent } from './editorial';
import type { Preferences, Reference } from './types';

export default function ReviewedParaphrase({reference,sourceText,preset,publication}:{reference:Reference;sourceText:string;preset:Preferences['preset'];publication:PublishedEditorial|null}) {
  const entry=useMemo(()=>preset==='genz'||preset==='pcm'?selectApprovedParaphrase(publication,reference,preset==='pcm'?'pcm':'en',preset==='pcm'?'pidgin_study':'genz'):null,[publication,reference,preset]);
  const key=refKey(reference);
  const [verified,setVerified]=useState<{entry:EditorialContent;key:string;sourceText:string;valid:boolean}|null>(null);
  useEffect(()=>{if(!entry)return;let active=true;paraphraseEvidenceMatches(reference,[{number:reference.verse,text:sourceText}],entry).then(valid=>{if(active)setVerified({entry,key,sourceText,valid});}).catch(()=>{if(active)setVerified({entry,key,sourceText,valid:false});});return()=>{active=false;};},[entry,key,sourceText,reference]);
  if(!entry||!verified?.valid||verified.entry!==entry||verified.key!==key||verified.sourceText!==sourceText)return null;
  return <aside className="reviewed-paraphrase" aria-label={preset==='pcm'?'Nigerian Pidgin edition':'Gen Z Edition'}><span className="source-label">{preset==='pcm'?'NIGERIAN PIDGIN':'GEN Z EDITION'}</span><p lang={entry.locale}>{entry.text}</p>{entry.interpretiveQualification&&<p lang={entry.locale}>{entry.interpretiveQualification}</p>}<small>Selected edition wording. {entry.origin==='ai_assisted'?'AI-assisted draft with recorded human review.':'Human-authored with recorded review.'}</small><details><summary>Review and sources</summary><p>Review date: {entry.review.reviewedAt?.slice(0,10)} · {entry.review.reviewerId?.includes('@')?'Registered reviewer':entry.review.reviewerId}</p><ul>{entry.sourceIds.map(id=><li key={id}>{/^https?:\/\//.test(id)?<a href={id} target="_blank" rel="noreferrer">{id}</a>:id}</li>)}</ul></details></aside>;
}
