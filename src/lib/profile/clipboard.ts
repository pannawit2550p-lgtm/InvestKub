export async function copyPlayerNumber(playerNumber: number): Promise<boolean> {
  const text = String(playerNumber);
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* Permission denied: try the local selection fallback. */ }
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute('aria-label', 'รหัสผู้เล่น');
  textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(textarea);
  try { textarea.select(); return document.execCommand('copy'); }
  catch { return false; }
  finally { textarea.remove(); previous?.focus(); }
}
