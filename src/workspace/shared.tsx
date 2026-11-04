import type { Reference } from '../types';
import { referenceLabel } from './model';
export interface WorkspaceProps { reference: Reference; onOpenReference: (ref: Reference) => void }
export function PassageLinks({ refs, onOpenReference }: { refs: Reference[]; onOpenReference: (ref: Reference) => void }) { return <div className="workspace-passages">{refs.map((ref, index) => <button className="text-button" type="button" key={`${referenceLabel(ref)}-${index}`} onClick={() => onOpenReference(ref)}>{referenceLabel(ref)}</button>)}</div>; }
export function downloadPrivateFile(name: string, text: string, mime: string) { const blob = new Blob([text], { type: mime }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function deviceTimeZone() { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
