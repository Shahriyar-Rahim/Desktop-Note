import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor, FolderOpen, Download, Upload, ShieldCheck, FileUp, BellRing } from 'lucide-react';
import Modal from './Modal.jsx';
import { getApi, errorMessage } from '../services/api.js';
import { formatDateTime, formatBytes } from '../utils/format.js';

const section = 'mb-5';
const h = 'mb-2 text-sm font-semibold';
const btn = 'flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700';

export default function SettingsPanel({ settings, info, onChange, onChooseDir, onExportBackup, onImportBackup, onImportText, onClose, toast }) {
  const [backups, setBackups] = useState([]);
  const refreshBackups = () => getApi().data.listBackups().then(setBackups).catch(() => {});
  useEffect(() => { refreshBackups(); }, []);

  async function backupNow() {
    try {
      const r = await getApi().data.createBackup();
      toast({ kind: 'success', text: `Database backup created (${r.name}).` });
      refreshBackups();
    } catch (e) { toast({ kind: 'error', text: errorMessage(e) }); }
  }

  const themes = [['system', 'System', Monitor], ['light', 'Light', Sun], ['dark', 'Dark', Moon]];

  return (
    <Modal title="Settings" onClose={onClose} width="max-w-xl">
      <div className={section}>
        <h3 className={h}>Appearance</h3>
        <div role="radiogroup" aria-label="Theme" className="flex gap-2">
          {themes.map(([value, label, Icon]) => (
            <button key={value} role="radio" aria-checked={settings.theme === value} onClick={() => onChange({ theme: value })}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${settings.theme === value ? 'border-amber-600 bg-amber-500/15' : 'border-stone-300 dark:border-stone-600'}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className={section}>
        <h3 className={h}>Reminders</h3>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.desktopNotifications} onChange={(e) => onChange({ desktopNotifications: e.target.checked })} className="h-4 w-4 accent-amber-600" />
          Show desktop notifications
        </label>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            Default reminder delay
            <input type="number" min="1" max="1440" value={settings.defaultReminderMinutes}
              onChange={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 1440) onChange({ defaultReminderMinutes: n }); }}
              className="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1 dark:border-stone-600 dark:bg-stone-900" aria-label="Default reminder delay in minutes" /> min
          </label>
          <button className={btn} onClick={() => getApi().settings.testNotification().catch((e) => toast({ kind: 'error', text: errorMessage(e) }))}>
            <BellRing className="h-4 w-4" /> Test notification
          </button>
        </div>
        {info && !info.notificationsSupported && <p className="mt-2 text-xs text-amber-700">This system reports that desktop notifications are not available. In-app alerts still work.</p>}
      </div>

      <div className={section}>
        <h3 className={h}>Export location</h3>
        <div className="flex items-center gap-2 text-sm">
          <code className="min-w-0 flex-1 truncate rounded bg-stone-100 px-2 py-1.5 dark:bg-stone-900" title={settings.exportDir || 'Documents folder'}>{settings.exportDir || 'Documents folder (default)'}</code>
          <button className={btn} onClick={onChooseDir}><FolderOpen className="h-4 w-4" /> Choose…</button>
          {settings.exportDir && <button className={btn} onClick={() => onChange({ exportDir: '' })}>Reset</button>}
        </div>
      </div>

      <div className={section}>
        <h3 className={h}>Backup and import</h3>
        <div className="flex flex-wrap gap-2">
          <button className={btn} onClick={onExportBackup}><Download className="h-4 w-4" /> Export all notes…</button>
          <button className={btn} onClick={onImportBackup}><Upload className="h-4 w-4" /> Import backup…</button>
          <button className={btn} onClick={onImportText}><FileUp className="h-4 w-4" /> Import .txt / .md…</button>
        </div>
      </div>

      <div className={section}>
        <h3 className={h}><ShieldCheck className="mr-1 inline h-4 w-4" aria-hidden="true" />Data safety</h3>
        <p className="mb-2 text-xs text-stone-500">
          Notes live in a local SQLite database. The app takes an automatic backup once a day, on exit (if the last one is over 6 hours old), and before every upgrade or import, keeping the 10 newest.
        </p>
        <div className="mb-2 flex gap-2">
          <button className={btn} onClick={backupNow}>Back up database now</button>
          <button className={btn} onClick={() => getApi().data.openBackupFolder().catch((e) => toast({ kind: 'error', text: errorMessage(e) }))}><FolderOpen className="h-4 w-4" /> Open backup folder</button>
        </div>
        <ul className="max-h-24 overflow-y-auto text-xs text-stone-500" aria-label="Database backups">
          {backups.length === 0 && <li>No backups yet.</li>}
          {backups.map((b) => <li key={b.name}>{b.name} · {formatDateTime(b.mtime)} · {formatBytes(b.size)}</li>)}
        </ul>
      </div>

      <div className="flex justify-end"><button className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700" onClick={onClose}>Done</button></div>
    </Modal>
  );
}
