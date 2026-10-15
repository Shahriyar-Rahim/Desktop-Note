import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Pin, Star, Flame, Folder, Trash2, FolderPlus, Pencil, FolderInput, Download, TriangleAlert, X, PenLine } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import NoteList from './components/NoteList.jsx';
import NoteEditor from './components/NoteEditor.jsx';
import StatusBar from './components/StatusBar.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import EmptyState from './components/EmptyState.jsx';
import RemindersPanel from './components/RemindersPanel.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import ImportDialog from './components/ImportDialog.jsx';
import CanvasBoard from './features/canvas/CanvasBoard.jsx';
import { useToast } from './components/Toasts.jsx';
import { useDialogs } from './components/Dialogs.jsx';
import { useAutosave } from './hooks/useAutosave.js';
import { useTheme } from './hooks/useTheme.js';
import { useShortcuts } from './hooks/useShortcuts.js';
import { useScheduler } from './hooks/useScheduler.js';
import { storage } from './storage/notesStorage.js';
import { getApi, errorMessage } from './services/api.js';

const EMPTY_SIDEBAR = { counts: { all: 0, pinned: 0, favorite: 0, urgent: 0 }, folders: [], tags: [], boards: [] };

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function App() {
  const toast = useToast();
  const { confirm, prompt, isOpen } = useDialogs();

  const [info, setInfo] = useState(null);
  const [settings, setSettings] = useState(null);
  const [data, setData] = useState(EMPTY_SIDEBAR);
  const [view, setView] = useState({ type: 'notes', filter: { kind: 'all' } });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 150);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [panel, setPanel] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [menu, setMenu] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [savedAt, setSavedAt] = useState(null);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);

  const dark = useTheme(settings?.theme);
  const searchRef = useRef(null);
  const anchorRef = useRef(null);
  const editorActions = useRef(null);
  const boardActions = useRef(null);
  const flushers = useRef(new Set());
  const requestSeq = useRef(0);

  const sort = settings?.noteSort ?? 'updated';
  const direction = settings?.noteSortDirection ?? 'desc';
  const queryRef = useRef({});
  queryRef.current = { filter: view.type === 'notes' ? view.filter : { kind: 'all' }, search: debouncedSearch, sort, direction };

  // ---------- loading data ----------
  const refreshSidebar = useCallback(async () => {
    try { setData(await storage.loadSidebar()); } catch (e) { toast({ kind: 'error', text: errorMessage(e) }); }
  }, [toast]);

  const refreshNotes = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const list = await storage.listNotes(queryRef.current);
      if (seq === requestSeq.current) { setNotes(list); setLoading(false); }
    } catch (e) {
      setLoading(false);
      toast({ kind: 'error', text: errorMessage(e) });
    }
  }, [toast]);

  const reloadAll = useCallback(() => Promise.all([refreshSidebar(), refreshNotes()]), [refreshSidebar, refreshNotes]);

  useEffect(() => {
    (async () => {
      try {
        const api = getApi();
        const [i, s] = await Promise.all([api.app.getInfo(), storage.getSettings()]);
        setInfo(i);
        setSettings(s);
        await refreshSidebar();
      } catch (e) { toast({ kind: 'error', text: errorMessage(e) }); }
    })();
  }, [refreshSidebar, toast]);

  useEffect(() => { if (settings) refreshNotes(); }, [settings === null, view, debouncedSearch, sort, direction, refreshNotes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open the first note automatically when nothing is open.
  useEffect(() => {
    if (view.type === 'notes' && !activeId && notes.length) { setActiveId(notes[0].id); setSelectedIds([notes[0].id]); anchorRef.current = notes[0].id; }
  }, [notes, activeId, view.type]);

  // ---------- saving ----------
  const saver = useAutosave(async (id, patch) => {
    await storage.updateNote(id, patch);
    setSavedAt(Date.now());
    refreshNotes();
    refreshSidebar();
  }, { delay: 700 });

  const registerFlusher = useCallback((fn) => { flushers.current.add(fn); return () => flushers.current.delete(fn); }, []);
  const flushAll = useCallback(async () => {
    await Promise.all([saver.flush(), ...[...flushers.current].map((f) => f())]);
  }, [saver]);
  const flushRef = useRef(flushAll);
  flushRef.current = flushAll;

  const onChanged = useCallback(() => { setRefreshToken((n) => n + 1); reloadAll(); }, [reloadAll]);

  // ---------- scheduler (reminders & timers) ----------
  const openNote = useCallback(async (id) => {
    await flushRef.current();
    setPanel(null);
    setSearch('');
    setView({ type: 'notes', filter: { kind: 'all' } });
    setActiveId(id);
    setSelectedIds([id]);
  }, []);

  const onSchedulerEvent = useCallback((event) => {
    if (event.type === 'reminder-fired') {
      const r = event.reminder;
      toast({ kind: 'reminder', title: 'Reminder', text: r.title, duration: 0, action: r.note_id ? { label: 'Open note', onClick: () => openNote(r.note_id) } : undefined });
    } else if (event.type === 'timer-done') {
      toast({ kind: 'reminder', title: 'Timer finished', text: event.timer.label, duration: 0 });
    } else if (event.type === 'reminders-missed') {
      toast({ kind: 'info', title: 'Missed reminders', text: `${event.reminders.length} reminder(s) expired while the app was closed.`, duration: 0, action: { label: 'Review', onClick: () => setPanel({ type: 'reminders' }) } });
    }
  }, [toast, openNote]);
  const scheduler = useScheduler({ onEvent: onSchedulerEvent });
  const reminderBadge = scheduler.reminders.filter((r) => r.status !== 'pending').length + scheduler.timers.filter((t) => t.state === 'done').length;

  // ---------- note actions ----------
  async function newNote() {
    await flushAll();
    const keepFolder = view.type === 'notes' && view.filter.kind === 'folder';
    try {
      const n = await storage.createNote({ folderId: keepFolder ? view.filter.folderId : null });
      setSearch('');
      if (view.type !== 'notes' || !['all', 'folder'].includes(view.filter.kind)) setView({ type: 'notes', filter: { kind: 'all' } });
      setActiveId(n.id);
      setSelectedIds([n.id]);
      anchorRef.current = n.id;
      await reloadAll();
    } catch (e) { toast({ kind: 'error', text: errorMessage(e) }); }
  }

  async function selectNote(id, { ctrl, shift } = {}) {
    if (ctrl) {
      setSelectedIds((cur) => {
        const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
        return next.length ? next : [id];
      });
      anchorRef.current = id;
      return;
    }
    if (shift && anchorRef.current) {
      const a = notes.findIndex((n) => n.id === anchorRef.current);
      const b = notes.findIndex((n) => n.id === id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelectedIds(notes.slice(lo, hi + 1).map((n) => n.id));
        return;
      }
    }
    if (id !== activeId) { await flushAll(); setActiveId(id); }
    setSelectedIds([id]);
    anchorRef.current = id;
  }

  async function deleteNotes(ids) {
    if (!ids.length) return;
    const first = notes.find((n) => n.id === ids[0]);
    const name = ids.length === 1 ? `"${first?.title || 'Untitled'}"` : `${ids.length} notes`;
    const ok = await confirm({
      title: ids.length === 1 ? 'Delete this note?' : 'Delete selected notes?',
      message: `${name} and any attachments will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    try {
      await flushAll();
      const res = await storage.deleteNotes(ids);
      if (ids.includes(activeId)) setActiveId(null);
      setSelectedIds([]);
      await reloadAll();
      toast({ kind: 'success', text: `${res.deleted} note${res.deleted === 1 ? '' : 's'} deleted.` });
    } catch (e) { toast({ kind: 'error', text: errorMessage(e) }); }
  }

  async function patchNote(id, patch) {
    try {
      await storage.updateNote(id, patch);
      setRefreshToken((n) => n + 1);
      await reloadAll();
    } catch (e) { toast({ kind: 'error', text: errorMessage(e) }); }
  }

  // ---------- folders & boards ----------
  const folderNameError = (v) => (v.trim().length < 1 ? 'Name is required' : v.trim().length > 60 ? 'Maximum 60 characters' : null);

  async function newFolder() {
    const name = await prompt({ title: 'New folder', label: 'Folder name', confirmLabel: 'Create', maxLength: 60, validate: folderNameError });
    if (!name) return;
    try { await storage.createFolder(name); await refreshSidebar(); } catch (e) { toast({ kind: 'error', text: errorMessage(e) }); }
  }

  async function renameFolder(folder) {
    const name = await prompt({ title: 'Rename folder', label: 'Folder name', initial: folder.name, confirmLabel: 'Rename', maxLength: 60, validate: folderNameError });
    if (!name || name === folder.name) return;
    try { await storage.renameFolder(folder.id, name); await reloadAll(); } catch (e) { toast({ kind: 'error', text: errorMessage(e) }); }
  }

  async function deleteFolder(folder, strategy) {
    const n = folder.note_count;
    const message = strategy === 'delete'
      ? `The folder "${folder.name}" and its ${n} note${n === 1 ? '' : 's'} will be permanently deleted.`
      : n > 0 ? `The ${n} note${n === 1 ? '' : 's'} in "${folder.name}" will be moved to the default folder. The folder itself will be removed.` : `The empty folder "${folder.name}" will be removed.`;
    if (!(await confirm({ title: 'Delete folder?', message, confirmLabel: strategy === 'delete' ? 'Delete folder and notes' : 'Delete folder', danger: true }))) return;
    try {
      await flushAll();
      await storage.deleteFolder(folder.id, strategy);
      if (view.type === 'notes' && view.filter.kind === 'folder' && view.filter.folderId === folder.id) { setActiveId(null); setView({ type: 'notes', filter: { kind: 'all' } }); }
      if (strategy === 'delete') setActiveId(null);
      onChanged();
    } catch (e) { toast({ kind: 'error', text: errorMessage(e) }); }
  }

  async function newBoard() {
    const name = await prompt({ title: 'New drawing board', label: 'Board name', initial: 'Untitled board', confirmLabel: 'Create', maxLength: 80, validate: folderNameError });
    if (!name) return;
    try {
      await flushAll();
      const b = await storage.createBoard(name);
      await refreshSidebar();
      setView({ type: 'board', id: b.id });
    } catch (e) { toast({ kind: 'error', text: errorMessage(e) }); }
  }

  async function deleteBoard(id) {
    if (!(await confirm({ title: 'Delete this board?', message: 'The drawing will be permanently deleted.', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await flushAll();
      await storage.deleteBoard(id);
      setView({ type: 'notes', filter: { kind: 'all' } });
      await refreshSidebar();
    } catch (e) { toast({ kind: 'error', text: errorMessage(e) }); }
  }

  async function renameBoardFromMenu(b) {
    const name = await prompt({ title: 'Rename board', label: 'Board name', initial: b.name, confirmLabel: 'Rename', maxLength: 80, validate: folderNameError });
    if (!name) return;
    try { await storage.saveBoard(b.id, { name }); await refreshSidebar(); } catch (e) { toast({ kind: 'error', text: errorMessage(e) }); }
  }

  async function selectFilter(filter) {
    await flushAll();
    setActiveId(null);
    setSelectedIds([]);
    setView({ type: 'notes', filter });
  }

  async function selectBoard(id) {
    await flushAll();
    setView({ type: 'board', id });
  }

  // ---------- import / export ----------
  async function exportNote(format) {
    if (!activeId) return;
    try {
      await flushAll();
      const res = await getApi().files.exportNote({ id: activeId, format });
      if (!res.canceled) toast({ kind: 'success', text: `Note exported as ${format.toUpperCase()}.` });
    } catch (e) { toast({ kind: 'error', title: 'Export failed', text: errorMessage(e) }); }
  }

  async function exportSelected(format, ids) {
    try {
      await flushAll();
      const res = await getApi().files.exportNotes({ ids, format });
      if (res.canceled) return;
      toast({ kind: res.failed.length ? 'error' : 'success', text: `${res.count} note(s) exported.${res.failed.length ? ` ${res.failed.length} failed: ${res.failed[0]}` : ''}` });
    } catch (e) { toast({ kind: 'error', title: 'Export failed', text: errorMessage(e) }); }
  }

  async function exportBackup() {
    try {
      await flushAll();
      const res = await getApi().files.exportBackup();
      if (res.canceled) return;
      toast({ kind: 'success', text: `Backup of ${res.notes} note(s) saved.` });
      res.warnings.forEach((w) => toast({ kind: 'error', text: w }));
    } catch (e) { toast({ kind: 'error', title: 'Backup failed', text: errorMessage(e) }); }
  }

  async function startImport() {
    try {
      await flushAll();
      const res = await getApi().files.importPreview();
      if (res.canceled) return;
      if (!res.ok) { toast({ kind: 'error', title: 'Cannot import this file', text: res.error, duration: 9000 }); return; }
      setPanel(null);
      setImportPreview(res);
    } catch (e) { toast({ kind: 'error', title: 'Import failed', text: errorMessage(e) }); }
  }

  async function applyImport(mode) {
    try {
      const r = await getApi().files.importApply({ token: importPreview.token, mode });
      setImportPreview(null);
      await reloadAll();
      setRefreshToken((n) => n + 1);
      toast({ kind: 'success', title: 'Import complete', text: `${r.importedNotes} note(s) imported, ${r.skippedNotes} skipped. A safety backup was saved.`, duration: 7000 });
    } catch (e) {
      setImportPreview(null);
      toast({ kind: 'error', title: 'Import failed - nothing was changed', text: errorMessage(e), duration: 9000 });
    }
  }

  async function importText() {
    try {
      const folderId = view.type === 'notes' && view.filter.kind === 'folder' ? view.filter.folderId : null;
      const res = await getApi().files.importTextFiles({ folderId });
      await reloadAll();
      if (res.created.length) toast({ kind: 'success', text: `${res.created.length} file(s) imported as notes.` });
      res.failed.forEach((f) => toast({ kind: 'error', title: `Could not import ${f.name}`, text: f.reason }));
    } catch (e) { toast({ kind: 'error', text: errorMessage(e) }); }
  }

  // ---------- settings ----------
  async function changeSettings(patch) {
    setSettings((s) => ({ ...s, ...patch }));
    try { setSettings(await storage.saveSettings(patch)); } catch (e) { toast({ kind: 'error', text: errorMessage(e) }); getApi().settings.get().then(setSettings); }
  }
  async function chooseExportDir() {
    try { setSettings(await getApi().settings.chooseExportDir()); } catch (e) { toast({ kind: 'error', text: errorMessage(e) }); }
  }

  // ---------- menus ----------
  const formatMenu = (x, y, ids) => setMenu({
    x, y,
    items: [['txt', 'Plain text (.txt)'], ['md', 'Markdown (.md)'], ['json', 'JSON (.json)'], ['pdf', 'PDF (.pdf)']].map(([f, label]) => ({ label, icon: FileText, onClick: () => exportSelected(f, ids) })),
  });

  function noteMenu(e, n) {
    const ids = selectedIds.includes(n.id) && selectedIds.length > 1 ? selectedIds : [n.id];
    const multi = ids.length > 1;
    const items = [
      { label: n.pinned ? 'Unpin' : 'Pin', icon: Pin, disabled: multi, onClick: () => patchNote(n.id, { pinned: !n.pinned }) },
      { label: n.favorite ? 'Remove from favorites' : 'Add to favorites', icon: Star, disabled: multi, onClick: () => patchNote(n.id, { favorite: !n.favorite }) },
      { label: n.urgent ? 'Clear urgent' : 'Mark urgent', icon: Flame, disabled: multi, onClick: () => patchNote(n.id, { urgent: !n.urgent }) },
      { separator: true },
      ...data.folders.filter((f) => f.id !== n.folder_id).map((f) => ({ label: `Move to ${f.name}`, icon: FolderInput, onClick: async () => { for (const id of ids) await patchNote(id, { folder_id: f.id }); } })),
      { separator: true },
      { label: multi ? `Export ${ids.length} notes…` : 'Export…', icon: Download, onClick: () => formatMenu(e.clientX, e.clientY, ids) },
      { label: multi ? `Delete ${ids.length} notes` : 'Delete', icon: Trash2, danger: true, onClick: () => deleteNotes(ids) },
    ];
    setMenu({ x: e.clientX, y: e.clientY, items });
  }

  function folderMenu(e, f) {
    setMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Rename', icon: Pencil, onClick: () => renameFolder(f) },
        { label: 'New note here', icon: FolderPlus, onClick: async () => { await selectFilter({ kind: 'folder', folderId: f.id }); newNote(); } },
        { separator: true },
        { label: 'Delete folder (keep notes)', icon: Trash2, danger: true, disabled: f.is_default, onClick: () => deleteFolder(f, 'move') },
        { label: 'Delete folder and its notes', icon: Trash2, danger: true, disabled: f.is_default || f.note_count === 0, onClick: () => deleteFolder(f, 'delete') },
      ],
    });
  }

  function boardMenu(e, b) {
    setMenu({ x: e.clientX, y: e.clientY, items: [
      { label: 'Rename', icon: Pencil, onClick: () => renameBoardFromMenu(b) },
      { label: 'Delete', icon: Trash2, danger: true, onClick: () => deleteBoard(b.id) },
    ] });
  }

  // ---------- native menu actions & window close ----------
  const actionsRef = useRef({});
  actionsRef.current = {
    'new-note': newNote,
    'new-folder': newFolder,
    'new-board': newBoard,
    save: async () => { await flushAll(); toast({ kind: 'success', text: 'All changes saved.', duration: 1500 }); },
    'export-note': () => (view.type === 'notes' && activeId ? formatMenu(window.innerWidth - 220, 60, null) : null),
    'export-backup': exportBackup,
    import: startImport,
    settings: () => setPanel({ type: 'settings' }),
    reminders: () => setPanel({ type: 'reminders' }),
    find: () => { if (view.type !== 'notes') setView({ type: 'notes', filter: { kind: 'all' } }); setTimeout(() => { searchRef.current?.focus(); searchRef.current?.select(); }, 0); },
    'toggle-theme': () => changeSettings({ theme: dark ? 'light' : 'dark' }),
    undo: () => {
      const el = document.activeElement;
      if (el && el.closest && el.closest('input, textarea') && !el.closest('.ProseMirror')) document.execCommand('undo');
      else if (view.type === 'board') boardActions.current?.undo();
      else editorActions.current?.undo();
    },
    redo: () => {
      const el = document.activeElement;
      if (el && el.closest && el.closest('input, textarea') && !el.closest('.ProseMirror')) document.execCommand('redo');
      else if (view.type === 'board') boardActions.current?.redo();
      else editorActions.current?.redo();
    },
  };
  // The "export-note" menu item exports the active note; it needs a format first.
  actionsRef.current['export-note'] = () => {
    if (view.type === 'notes' && activeId) {
      setMenu({ x: window.innerWidth - 240, y: 70, items: [['txt', 'Plain text (.txt)'], ['md', 'Markdown (.md)'], ['json', 'JSON (.json)'], ['pdf', 'PDF (.pdf)']].map(([f, label]) => ({ label, icon: FileText, onClick: () => exportNote(f) })) });
    }
  };

  useEffect(() => {
    const api = getApi();
    const offMenu = api.on('menu:action', (name) => actionsRef.current[name]?.());
    const offClose = api.on('app:beforeClose', async () => {
      try { await flushRef.current(); } finally { await api.app.readyToClose(); }
    });
    return () => { offMenu(); offClose(); };
  }, []);

  useEffect(() => {
    const warn = (e) => { if (saver.hasPending()) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saver]);

  useShortcuts({
    isDialogOpen: isOpen,
    onDelete: (event) => {
      // Only act when the note list itself has focus, never from other places.
      if (view.type !== 'notes' || !event.target.closest?.('[role="listbox"]')) return false;
      const ids = selectedIds.length ? selectedIds : activeId ? [activeId] : [];
      if (!ids.length) return false;
      deleteNotes(ids);
      return true;
    },
  });

  // ---------- render ----------
  const title = useMemo(() => {
    const f = view.type === 'notes' ? view.filter : null;
    if (!f) return 'Notes';
    if (f.kind === 'all') return 'All Notes';
    if (f.kind === 'pinned') return 'Pinned';
    if (f.kind === 'favorite') return 'Favorites';
    if (f.kind === 'urgent') return 'Urgent';
    if (f.kind === 'tag') return `#${f.tag}`;
    return data.folders.find((x) => x.id === f.folderId)?.name ?? 'Folder';
  }, [view, data.folders]);

  if (!settings) return <div className="flex h-full items-center justify-center text-stone-400" role="status">Loading…</div>;

  const showRecovery = info?.recovery && !recoveryDismissed;
  const linkNote = panel?.type === 'reminders' ? panel.linkNote : null;

  return (
    <div className="flex h-full flex-col bg-stone-50 text-stone-900 dark:bg-stone-900 dark:text-stone-100">
      {showRecovery && (
        <div role="alert" className="flex items-start gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <TriangleAlert className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <p className="flex-1">
            The database file was damaged and was moved aside as <code>{info.recovery.corruptFileName}</code>.{' '}
            {info.recovery.restoredFromBackup ? 'Your notes were restored from the newest automatic backup, so the last few changes may be missing.' : 'No usable backup was found, so the app started with an empty database. You can import an exported backup from Settings.'}
          </p>
          <button aria-label="Dismiss" onClick={() => setRecoveryDismissed(true)}><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Sidebar
          data={data} view={view}
          onSelectFilter={selectFilter} onSelectBoard={selectBoard}
          onNewFolder={newFolder} onNewBoard={newBoard}
          onFolderMenu={folderMenu} onBoardMenu={boardMenu}
          onOpenSettings={() => setPanel({ type: 'settings' })}
          onOpenReminders={() => setPanel({ type: 'reminders' })}
          reminderBadge={reminderBadge}
        />

        {view.type === 'notes' ? (
          <>
            <NoteList
              title={title} notes={notes} loading={loading}
              activeId={activeId} selectedIds={selectedIds}
              search={search} onSearch={setSearch} searchRef={searchRef}
              sort={sort} direction={direction} onSortChange={(s, d) => changeSettings({ noteSort: s, noteSortDirection: d })}
              onNew={newNote} onSelect={selectNote} onContextMenu={noteMenu}
              onDeleteSelected={() => deleteNotes(selectedIds)}
              onExportSelected={(e) => { const r = e.currentTarget.getBoundingClientRect(); formatMenu(r.left, r.bottom + 4, selectedIds); }}
              onClearSelection={() => setSelectedIds(activeId ? [activeId] : [])}
            />
            <main className="flex min-w-0 flex-1">
              {activeId ? (
                <NoteEditor
                  key={activeId} noteId={activeId}
                  folders={data.folders} allTags={data.tags.map((t) => t.name)}
                  savedAt={savedAt} refreshToken={refreshToken}
                  queue={saver.queue} onChanged={onChanged}
                  onRemind={(n) => setPanel({ type: 'reminders', linkNote: n })}
                  onDelete={deleteNotes} onExport={exportNote}
                  registerActions={(a) => { editorActions.current = a; }}
                />
              ) : (
                <EmptyState icon={FileText} title="No note selected" text="Choose a note from the list, or create a new one with Ctrl+N."
                  action={<button onClick={newNote} className="mt-2 rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700">New note</button>} />
              )}
            </main>
          </>
        ) : (
          <main className="flex min-w-0 flex-1">
            <CanvasBoard
              key={view.id} boardId={view.id} isDark={dark}
              registerFlusher={registerFlusher}
              registerActions={(a) => { boardActions.current = a; }}
              onRenamed={refreshSidebar} onDeleted={() => deleteBoard(view.id)}
            />
          </main>
        )}
      </div>

      <StatusBar saveStatus={saver.status} onRetry={() => saver.flush()} info={info} noteCount={data.counts.all} />

      {panel?.type === 'settings' && (
        <SettingsPanel settings={settings} info={info} onChange={changeSettings} onChooseDir={chooseExportDir}
          onExportBackup={exportBackup} onImportBackup={startImport} onImportText={importText}
          onClose={() => setPanel(null)} toast={toast} />
      )}
      {panel?.type === 'reminders' && (
        <RemindersPanel scheduler={scheduler} settings={settings} linkNote={linkNote} onOpenNote={openNote} onClose={() => setPanel(null)} toast={toast} />
      )}
      {importPreview && <ImportDialog preview={importPreview} onApply={applyImport} onClose={() => setImportPreview(null)} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
