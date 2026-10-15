import { useEffect } from 'react';
import { shouldHandleGlobalDelete } from '../utils/dom.js';

// Renderer-side shortcuts. Ctrl/Cmd+N, S, F, E are native-menu accelerators
// (see electron/menu.js); Ctrl/Cmd+B, I, Z, Shift+Z are handled by the editor.
// Only "Delete" needs a global listener, and it is guarded so it never fires
// while the user is typing or while a dialog is open. The handler receives
// the event so the caller can add further checks (for example: only inside
// the note list).
export function useShortcuts({ onDelete, isDialogOpen }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (shouldHandleGlobalDelete(event, { dialogOpen: isDialogOpen() })) {
        if (onDelete(event)) event.preventDefault();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDelete, isDialogOpen]);
}
