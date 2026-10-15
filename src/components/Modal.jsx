import { useEffect, useRef } from 'react';

// Open modals, oldest first. Only the last (topmost) one reacts to the keyboard.
const openModals = [];

// Accessible modal shell: Escape closes, focus moves inside, Tab stays inside.
export default function Modal({ title, onClose, children, width = 'max-w-md', labelledBy = 'modal-title' }) {
  const ref = useRef(null);
  // Keep the latest onClose in a ref so the focus-trap effect below runs only
  // once per dialog (otherwise it would re-run on every keystroke).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement;
    const root = ref.current;
    const focusables = () => root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = root.querySelector('[data-autofocus]') || focusables()[0];
    first?.focus();
    openModals.push(root);
    function onKey(e) {
      if (openModals[openModals.length - 1] !== root) return;
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); return; }
      if (e.key !== 'Tab') return;
      const items = [...focusables()].filter((el) => !el.disabled);
      if (!items.length) return;
      if (!root.contains(document.activeElement)) { e.preventDefault(); items[0].focus(); return; }
      const a = items[0];
      const z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
    // Listen on the document: if focus is lost (for example the focused button
    // was removed) Escape and Tab must still work.
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey);
      openModals.splice(openModals.indexOf(root), 1); previous?.focus?.(); };
  }, []);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCloseRef.current(); }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`max-h-[90vh] w-full ${width} overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-700 dark:bg-stone-800`}
      >
        <h2 id={labelledBy} className="mb-3 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
