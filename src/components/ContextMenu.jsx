import { useEffect, useRef, useState } from 'react';

// items: [{ label, icon: LucideIcon, onClick, danger, disabled } | { separator: true }]
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const actionable = items.filter((i) => !i.separator);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const r = ref.current.getBoundingClientRect();
    setPos({
      left: Math.min(x, window.innerWidth - r.width - 8),
      top: Math.min(y, window.innerHeight - r.height - 8),
    });
    ref.current.focus();
  }, [x, y]);

  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % actionable.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + actionable.length) % actionable.length); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const item = actionable[active];
      if (item && !item.disabled) { onClose(); item.onClick(); }
    }
  }

  let index = -1;
  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-50 min-w-48 rounded-xl border border-stone-200 bg-white p-1 text-sm shadow-xl outline-none dark:border-stone-700 dark:bg-stone-800"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.separator) return <div key={`sep${i}`} className="my-1 h-px bg-stone-200 dark:bg-stone-700" role="separator" />;
        index += 1;
        const mine = index;
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            role="menuitem"
            disabled={item.disabled}
            onMouseEnter={() => setActive(mine)}
            onClick={() => { onClose(); item.onClick(); }}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left disabled:opacity-40 ${
              active === mine ? 'bg-stone-100 dark:bg-stone-700' : ''
            } ${item.danger ? 'text-red-600 dark:text-red-400' : ''}`}
          >
            {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : <span className="w-4" />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
