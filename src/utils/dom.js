// True when the keyboard focus is somewhere the user is typing text.
// Global shortcuts such as Delete must never act in these places.
export function isEditableTarget(target) {
  if (!target || !(target instanceof Element)) return false;
  if (
    target.closest(
      'input, textarea, select, [contenteditable="true"], .ProseMirror',
    )
  )
    return true;
  return false;
}

// Decide whether a global "Delete" key press should delete the selected note.
export function shouldHandleGlobalDelete(event, { dialogOpen = false } = {}) {
  if (event.key !== "Delete") return false;
  if (
    event.defaultPrevented ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey
  )
    return false;
  if (dialogOpen) return false;
  return !isEditableTarget(event.target);
}

export function normalizeUrl(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (/^(https?:\/\/|mailto:)/i.test(raw)) return raw;
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(raw)) return `mailto:${raw}`;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(raw)) return `https://${raw}`;
  return null; // anything else (javascript:, file:, plain words) is refused
}
