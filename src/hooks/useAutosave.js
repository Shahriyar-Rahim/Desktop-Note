import { useCallback, useEffect, useRef, useState } from 'react';

// Debounced auto-save.
//
//   const saver = useAutosave((id, patch) => storage.updateNote(id, patch));
//   saver.queue(noteId, { title: 'New title' });   // call on every edit
//   await saver.flush();                            // before switching notes / closing
//
// Patches for the same note are merged, so 100 keystrokes become one write.
export function useAutosave(saveFn, { delay = 700 } = {}) {
  const [status, setStatus] = useState('idle'); // idle | pending | saving | saved | error
  const [error, setError] = useState(null);
  const pending = useRef(null); // { id, patch }
  const timer = useRef(null);
  const chain = useRef(Promise.resolve());
  const saveRef = useRef(saveFn);
  saveRef.current = saveFn;

  const run = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    const job = pending.current;
    if (!job) return chain.current;
    pending.current = null;
    setStatus('saving');
    chain.current = chain.current.then(async () => {
      try {
        await saveRef.current(job.id, job.patch);
        setError(null);
        setStatus(pending.current ? 'pending' : 'saved');
      } catch (err) {
        // Keep the unsaved data so a later flush can retry; never drop it.
        const newer = pending.current;
        pending.current = newer && newer.id === job.id
          ? { id: job.id, patch: { ...job.patch, ...newer.patch } }
          : newer || job;
        setError(err);
        setStatus('error');
      }
    });
    return chain.current;
  }, []);

  const queue = useCallback((id, patch) => {
    const current = pending.current;
    if (current && current.id !== id) run(); // switching note: save the old one first
    const base = pending.current && pending.current.id === id ? pending.current.patch : {};
    pending.current = { id, patch: { ...base, ...patch } };
    setStatus('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(run, delay);
  }, [delay, run]);

  const flush = useCallback(() => run(), [run]);
  const hasPending = useCallback(() => pending.current !== null, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { status, error, queue, flush, hasPending };
}
