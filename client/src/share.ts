export type ShareResult = 'copied' | 'shared' | 'manual' | 'cancelled';
export async function shareLink(url: string): Promise<ShareResult> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return 'copied';
    }
  } catch {
    /* Try the next supported method. */
  }
  try {
    if (navigator.share) {
      await navigator.share({ url });
      return 'shared';
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
  }
  const focused = document.activeElement as HTMLElement | null;
  const field = document.createElement('textarea');
  field.value = url;
  field.setAttribute('aria-label', 'Location link');
  field.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0';
  document.body.append(field);
  try {
    field.select();
    if (document.execCommand?.('copy')) return 'copied';
  } catch {
    /* The caller provides a selectable link. */
  } finally {
    field.remove();
    focused?.focus({ preventScroll: true });
  }
  return 'manual';
}
