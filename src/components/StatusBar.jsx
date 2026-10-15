import { CheckCircle2, LoaderCircle, CircleAlert, Pencil, Database, BellOff } from 'lucide-react';

const SAVE_LABEL = {
  idle: ['All changes saved', CheckCircle2, 'text-stone-400'],
  saved: ['All changes saved', CheckCircle2, 'text-emerald-600 dark:text-emerald-400'],
  pending: ['Unsaved changes…', Pencil, 'text-amber-600'],
  saving: ['Saving…', LoaderCircle, 'text-amber-600'],
  error: ['Save failed - click to retry', CircleAlert, 'text-red-600'],
};

export default function StatusBar({ saveStatus, onRetry, info, noteCount }) {
  const [label, Icon, color] = SAVE_LABEL[saveStatus] ?? SAVE_LABEL.idle;
  return (
    <footer className="flex h-7 flex-none items-center gap-4 border-t border-stone-200 bg-stone-100 px-3 text-xs text-stone-500 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-400">
      <button
        onClick={saveStatus === 'error' ? onRetry : undefined}
        className={`flex items-center gap-1.5 ${color}`}
        role="status"
        aria-live="polite"
        data-testid="save-status"
      >
        <Icon className={`h-3.5 w-3.5 ${saveStatus === 'saving' ? 'animate-spin' : ''}`} aria-hidden="true" />
        {label}
      </button>
      <span className="flex items-center gap-1.5"><Database className="h-3.5 w-3.5" aria-hidden="true" /> Stored locally · {noteCount} note{noteCount === 1 ? '' : 's'}</span>
      {info && !info.notificationsSupported && <span className="flex items-center gap-1.5 text-amber-700"><BellOff className="h-3.5 w-3.5" /> Desktop notifications unavailable</span>}
      <span className="ml-auto">{info ? `v${info.version} · Electron ${info.electron}` : ''}</span>
    </footer>
  );
}
