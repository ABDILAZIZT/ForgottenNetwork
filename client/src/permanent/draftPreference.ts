// Missing, corrupt or unavailable storage must never opt an artist into publication.
export const draftPreferenceKey = (artist: string) => 'fn_canvas_draft_mode:' + artist;
export function readDraftMode(artist?: string): boolean {
  if (!artist) return true;
  try {
    return localStorage.getItem(draftPreferenceKey(artist)) !== 'false';
  } catch {
    return true;
  }
}
export function saveDraftMode(artist: string, enabled: boolean): void {
  localStorage.setItem(draftPreferenceKey(artist), String(enabled));
}
