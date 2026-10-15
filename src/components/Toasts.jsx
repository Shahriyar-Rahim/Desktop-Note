import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Info, BellRing, X } from 'lucide-react';

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

const ICONS = { success: CheckCircle2, error: CircleAlert, info: Info, reminder: BellRing };
const COLORS = {
  success: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-red-600 dark:text-red-400',
  info: 'text-sky-600 dark:text-sky-400',
  reminder: 'text-amber-600 dark:text-amber-400',
};

// toast({ kind, title, text, duration, action: { label, onClick } })
// duration 0 = stays until the user closes it.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback((t) => {
    const id = ++counter.current;
    const duration = t.duration ?? (t.kind === 'error' ? 7000 : 3500);
    setToasts((list) => [...list.slice(-4), { id, kind: 'info', ...t }]);
    if (duration > 0) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-10 right-4 z-50 flex w-80 flex-col gap-2"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.kind] ?? Info;
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-lg dark:border-stone-700 dark:bg-stone-800"
            >
              <Icon className={`mt-0.5 h-5 w-5 flex-none ${COLORS[t.kind]}`} aria-hidden="true" />
              <div className="min-w-0 flex-1 text-sm">
                {t.title && <div className="font-semibold">{t.title}</div>}
                {t.text && <div className="break-words text-stone-600 dark:text-stone-300">{t.text}</div>}
                {t.action && (
                  <button
                    className="mt-1 text-amber-700 underline dark:text-amber-400"
                    onClick={() => { t.action.onClick(); dismiss(t.id); }}
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                className="rounded p-0.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-700"
                aria-label="Dismiss notification"
                onClick={() => dismiss(t.id)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
