import { useState } from 'react';
import Modal from './Modal.jsx';

export default function ImportDialog({ preview, onApply, onClose }) {
  const { report, fileName } = preview;
  const [mode, setMode] = useState('skip');
  const [busy, setBusy] = useState(false);
  const destructive = mode === 'overwrite' && report.notes.duplicates > 0;

  return (
    <Modal title="Import backup" onClose={onClose} width="max-w-lg">
      <p className="mb-3 text-sm text-stone-600 dark:text-stone-300">
        <strong>{fileName}</strong>{report.exportedAt ? ` · created ${new Date(report.exportedAt).toLocaleString()}` : ''}
      </p>
      <ul className="mb-3 space-y-0.5 text-sm" aria-label="Import summary">
        <li>Notes in file: <strong>{report.notes.total}</strong> ({report.notes.new} new, {report.notes.duplicates} already in this app)</li>
        <li>Folders: <strong>{report.folders.total}</strong> · Boards: <strong>{report.boards.total}</strong> · Attachments: <strong>{report.attachments}</strong></li>
      </ul>

      {report.notes.duplicates > 0 && (
        <fieldset className="mb-3 space-y-1.5 text-sm">
          <legend className="mb-1 font-medium">{report.notes.duplicates} note(s) already exist. What should happen?</legend>
          <label className="flex items-start gap-2"><input type="radio" name="mode" checked={mode === 'skip'} onChange={() => setMode('skip')} className="mt-1 accent-amber-600" /><span><strong>Keep my current versions</strong> and only add new notes (safe)</span></label>
          <label className="flex items-start gap-2"><input type="radio" name="mode" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} className="mt-1 accent-amber-600" /><span><strong>Replace</strong> existing notes with the versions from the file</span></label>
        </fieldset>
      )}

      {(report.skipped.length > 0 || report.warnings.length > 0) && (
        <div className="mb-3 max-h-32 overflow-y-auto rounded-lg bg-amber-500/10 p-2 text-xs" role="region" aria-label="Import problems">
          <div className="mb-1 font-medium">Some content could not be imported:</div>
          <ul className="list-disc pl-4">
            {report.skipped.map((s, i) => <li key={`s${i}`}>{s.kind} #{s.index + 1}: {s.reason}</li>)}
            {report.warnings.map((w, i) => <li key={`w${i}`}>{w}</li>)}
          </ul>
        </div>
      )}

      <p className="mb-4 text-xs text-stone-500">A safety backup of your current database is created automatically before anything changes.</p>
      <div className="flex justify-end gap-2">
        <button className="rounded-lg bg-stone-100 px-3.5 py-1.5 text-sm dark:bg-stone-700" onClick={onClose}>Cancel</button>
        <button
          data-autofocus disabled={busy || report.notes.total + report.boards.total === 0}
          onClick={async () => { setBusy(true); await onApply(mode); }}
          className={`rounded-lg px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-40 ${destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
        >
          {destructive ? 'Replace and import' : 'Import'}
        </button>
      </div>
    </Modal>
  );
}
