import { useEffect, useState } from 'react';
import { Bell, Timer, Play, Pause, X, Check, AlarmClock } from 'lucide-react';
import Modal from './Modal.jsx';
import { formatDateTime, formatDuration, toLocalInputValue, fromLocalInputValue } from '../utils/format.js';
import { errorMessage } from '../services/api.js';

const input = 'rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-900';
const primary = 'rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-40';
const ghost = 'rounded-md p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-700';

function Countdown({ timer }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (timer.state !== 'running') return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer.state]);
  const remaining = timer.state === 'running' ? timer.ends_at - now : timer.remaining_ms;
  return <span className="font-mono text-lg tabular-nums" data-testid="countdown">{formatDuration(remaining)}</span>;
}

export default function RemindersPanel({ scheduler, settings, linkNote, onOpenNote, onClose, toast }) {
  const { reminders, timers } = scheduler;
  const [tab, setTab] = useState('reminders');
  const [title, setTitle] = useState(linkNote?.title ? `Check: ${linkNote.title}` : '');
  const [due, setDue] = useState(toLocalInputValue(Date.now() + settings.defaultReminderMinutes * 60_000));
  const [label, setLabel] = useState('Timer');
  const [minutes, setMinutes] = useState(5);
  const [seconds, setSeconds] = useState(0);

  const fail = (e) => toast({ kind: 'error', text: errorMessage(e) });

  async function addReminder(e) {
    e.preventDefault();
    const dueAt = fromLocalInputValue(due);
    if (!dueAt) return toast({ kind: 'error', text: 'Please choose a valid date and time.' });
    try {
      await scheduler.createReminder({ title, dueAt, noteId: linkNote?.id ?? null });
      setTitle('');
      toast({ kind: 'success', text: 'Reminder saved.' });
    } catch (err) { fail(err); }
  }

  async function addTimer(e) {
    e.preventDefault();
    try {
      await scheduler.createTimer({ label, durationMs: (minutes * 60 + seconds) * 1000, noteId: linkNote?.id ?? null });
    } catch (err) { fail(err); }
  }

  const upcoming = reminders.filter((r) => r.status === 'pending');
  const past = reminders.filter((r) => r.status !== 'pending');

  return (
    <Modal title="Reminders and timers" onClose={onClose} width="max-w-xl">
      <div role="tablist" className="mb-4 flex gap-1 rounded-lg bg-stone-100 p-1 dark:bg-stone-900">
        {[['reminders', 'Reminders', Bell], ['timers', 'Timers', Timer]].map(([id, text, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm ${tab === id ? 'bg-white font-medium shadow-sm dark:bg-stone-700' : 'text-stone-500'}`}>
            <Icon className="h-4 w-4" /> {text}
          </button>
        ))}
      </div>

      {tab === 'reminders' && (
        <>
          <form onSubmit={addReminder} className="mb-4 flex flex-wrap gap-2">
            <input data-autofocus className={`${input} min-w-40 flex-1`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Remind me to…" aria-label="Reminder text" maxLength={200} required />
            <input className={input} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Reminder date and time" required />
            <button className={primary} disabled={!title.trim()}>Add</button>
          </form>
          {linkNote && <p className="-mt-2 mb-3 text-xs text-stone-500">Linked to the note "{linkNote.title || 'Untitled'}".</p>}
          <ul className="space-y-1.5" aria-label="Reminders">
            {upcoming.length === 0 && past.length === 0 && <li className="py-6 text-center text-sm text-stone-400">No reminders yet.</li>}
            {upcoming.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700">
                <AlarmClock className="h-4 w-4 flex-none text-amber-600" aria-hidden="true" />
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.title}</div><div className="text-xs text-stone-500">{formatDateTime(r.due_at)}</div></div>
                {r.note_id && <button className="text-xs text-amber-700 underline dark:text-amber-400" onClick={() => onOpenNote(r.note_id)}>Open note</button>}
                <button className={ghost} aria-label={`Cancel reminder ${r.title}`} title="Cancel" onClick={() => scheduler.cancelReminder(r.id).catch(fail)}><X className="h-4 w-4" /></button>
              </li>
            ))}
            {past.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2 text-sm dark:bg-stone-900">
                <span className={`rounded px-1.5 text-xs ${r.status === 'missed' ? 'bg-red-500/15 text-red-700 dark:text-red-300' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'}`}>{r.status === 'missed' ? 'Missed' : 'Done'}</span>
                <div className="min-w-0 flex-1"><div className="truncate">{r.title}</div><div className="text-xs text-stone-500">{formatDateTime(r.due_at)}</div></div>
                {r.note_id && <button className="text-xs text-amber-700 underline dark:text-amber-400" onClick={() => onOpenNote(r.note_id)}>Open note</button>}
                <button className={ghost} aria-label={`Dismiss ${r.title}`} title="Dismiss" onClick={() => scheduler.dismissReminder(r.id).catch(fail)}><Check className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === 'timers' && (
        <>
          <form onSubmit={addTimer} className="mb-4 flex flex-wrap items-center gap-2">
            <input className={`${input} min-w-32 flex-1`} value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Timer label" maxLength={100} required />
            <label className="flex items-center gap-1 text-sm"><input className={`${input} w-16`} type="number" min="0" max="1440" value={minutes} onChange={(e) => setMinutes(Math.max(0, Number(e.target.value)))} aria-label="Minutes" /> min</label>
            <label className="flex items-center gap-1 text-sm"><input className={`${input} w-16`} type="number" min="0" max="59" value={seconds} onChange={(e) => setSeconds(Math.min(59, Math.max(0, Number(e.target.value))))} aria-label="Seconds" /> sec</label>
            <button className={primary} disabled={minutes * 60 + seconds < 1 || !label.trim()}>Start</button>
          </form>
          <ul className="space-y-1.5" aria-label="Timers">
            {timers.length === 0 && <li className="py-6 text-center text-sm text-stone-400">No timers running.</li>}
            {timers.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700">
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{t.label}</div><div className="text-xs text-stone-500">{t.state === 'done' ? 'Finished' : t.state === 'paused' ? 'Paused' : 'Running'}</div></div>
                {t.state === 'done' ? <span className="font-mono text-lg text-emerald-600">0:00</span> : <Countdown timer={t} />}
                {t.state === 'running' && <button className={ghost} aria-label={`Pause ${t.label}`} title="Pause" onClick={() => scheduler.pauseTimer(t.id).catch(fail)}><Pause className="h-4 w-4" /></button>}
                {t.state === 'paused' && <button className={ghost} aria-label={`Resume ${t.label}`} title="Resume" onClick={() => scheduler.resumeTimer(t.id).catch(fail)}><Play className="h-4 w-4" /></button>}
                {t.state === 'done'
                  ? <button className={ghost} aria-label={`Dismiss ${t.label}`} title="Dismiss" onClick={() => scheduler.dismissTimer(t.id).catch(fail)}><Check className="h-4 w-4" /></button>
                  : <button className={ghost} aria-label={`Cancel ${t.label}`} title="Cancel" onClick={() => scheduler.cancelTimer(t.id).catch(fail)}><X className="h-4 w-4" /></button>}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-4 text-xs text-stone-500">
        Reminders and timers fire while the app is running. If the app was closed when a reminder was due, it shows up as "Missed".
      </p>
    </Modal>
  );
}
