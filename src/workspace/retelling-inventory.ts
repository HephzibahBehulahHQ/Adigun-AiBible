import { validateWorkspace, workspaceRecordings } from './model.ts';
import type { WorkspaceState } from './model';
import { MAX_WORKSPACE_AUDIO_BYTES, sameRecording, validateRetellingRecording, verifyRetellingMedia } from './retelling-media.ts';
import type { RetellingMedia } from './retelling-media';

export interface WorkspaceSnapshot { state: WorkspaceState; media: RetellingMedia[] }
export function checkWorkspaceMedia(state: WorkspaceState, media: RetellingMedia[]): RetellingMedia[] {
  if (!Array.isArray(media) || media.length > 5000 || media.reduce((sum, file) => sum + (file?.blob?.size || 0), 0) > MAX_WORKSPACE_AUDIO_BYTES) throw new Error('The workspace audio inventory exceeds its 32 MiB limit.');
  const byId = new Map<string, RetellingMedia>();
  for (const file of media) {
    const recording = validateRetellingRecording(file?.recording);
    if (!(file.blob instanceof Blob) || file.blob.size !== recording.bytes || file.blob.type !== recording.mimeType || byId.has(recording.id)) throw new Error('The workspace has invalid or duplicate original recordings. Existing data was not replaced.');
    byId.set(recording.id, { recording, blob:file.blob });
  }
  const needed = workspaceRecordings(state);
  if (needed.length !== byId.size) throw new Error('The saved audio inventory does not match its retelling references. Existing data was not replaced.');
  return needed.map(recording => {
    const file = byId.get(recording.id);
    if (!file || !sameRecording(recording, file.recording)) throw new Error('An original retelling recording is missing or does not match its saved reference. Existing data was not replaced.');
    return file;
  });
}
export async function verifyWorkspaceSnapshot(snapshot: WorkspaceSnapshot): Promise<WorkspaceSnapshot> {
  const state = validateWorkspace(snapshot.state);
  const files = checkWorkspaceMedia(state, snapshot.media);
  const media: RetellingMedia[] = [];
  // Sequential verification keeps the temporary audio allocation at one bounded file.
  for (const file of files) media.push(await verifyRetellingMedia(file));
  return { state, media };
}
