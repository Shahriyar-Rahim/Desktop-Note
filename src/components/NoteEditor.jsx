import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Pin, Star, Flame, Bell, Download, Trash2, FileText } from 'lucide-react';
import Toolbar from './Toolbar.jsx';
import TagBar from './TagBar.jsx';
import AttachmentBar from './AttachmentBar.jsx';
import ContextMenu from './ContextMenu.jsx';
import { createExtensions } from '../features/editor/extensions.js';
import { storage } from '../storage/notesStorage.js';
import { getApi, errorMessage } from '../services/api.js';
import { useToast } from './Toasts.jsx';
import { useDialogs } from './Dialogs.jsx';
import { formatDateTime } from '../utils/format.js';
import { normalizeUrl } from '../utils/dom.js';

const flagBtn = (on, color) =>
  `rounded-lg p-1.5 ${on ? `${color} bg-stone-100 dark:bg-stone-800` : 'text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800'}`;

export default function NoteEditor({
  noteId, folders, allTags, savedAt, refreshToken, queue, onChanged, onRemind, onDelete, onExport, registerActions,
}) {
  const toast = useToast();
  const { prompt, confirm } = useDialogs();
  const [note, setNote] = useState(null);
  const [meta, setMeta] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [title, setTitle] = useState('');
  const [loadError, setLoadError] = useState(null);
  const [menu, setMenu] = useState(null);
  const titleRef = useRef(null);

  // ---- load the note (content + metadata) ----
  useEffect(() => {
    let cancelled = false;
    storage.getNote(noteId)
      .then((n) => {
        if (cancelled) return;
        setNote(n);
        setTitle(n.title);
        setAttachments(n.attachments);
        setMeta({ pinned: n.pinned, favorite: n.favorite, urgent: n.urgent, folder_id: n.folder_id, tags: n.tags, updated_at: n.updated_at });
        if (!n.title && !n.content_text) requestAnimationFrame(() => titleRef.current?.focus());
      })
      .catch((e) => !cancelled && setLoadError(errorMessage(e)));
    return () => { cancelled = true; };
  }, [noteId]);

  // Metadata may change from outside (context menu in the list).
  useEffect(() => {
    if (!refreshToken || !note) return;
    storage.getNote(noteId).then((n) => {
      setMeta({ pinned: n.pinned, favorite: n.favorite, urgent: n.urgent, folder_id: n.folder_id, tags: n.tags, updated_at: n.updated_at });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const editor = useEditor({
    extensions: createExtensions(),
    content: note ? note.content_html : '',
    editorProps: {
      attributes: { 'aria-label': 'Note content', 'data-testid': 'editor' },
      handleClick(_view, _pos, event) {
        const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
        if (link && (event.ctrlKey || event.metaKey)) {
          getApi().app.openExternal({ url: link.href }).catch((e) => toast({ kind: 'error', text: errorMessage(e) }));
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => queue(noteId, { content_html: e.getHTML() }),
  }, [note?.id]);

  // Actions the app shell can trigger (menu items, shortcuts).
  useEffect(() => {
    if (!editor) return undefined;
    registerActions({
      undo: () => editor.chain().focus().undo().run(),
      redo: () => editor.chain().focus().redo().run(),
      focusEditor: () => editor.commands.focus('end'),
    });
    return () => registerActions(null);
  }, [editor, registerActions]);

  const updateMeta = useCallback(async (patch) => {
    try {
      await storage.updateNote(noteId, patch);
      setMeta((m) => ({ ...m, ...patch }));
      onChanged();
    } catch (e) {
      toast({ kind: 'error', text: errorMessage(e) });
    }
  }, [noteId, onChanged, toast]);

  const saveTags = useCallback(async (tags) => {
    try {
      const saved = await storage.setTags(noteId, tags);
      setMeta((m) => ({ ...m, tags: saved }));
      onChanged();
    } catch (e) {
      toast({ kind: 'error', text: errorMessage(e) });
    }
  }, [noteId, onChanged, toast]);

  async function onLink() {
    if (editor.isActive('link')) { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    const raw = await prompt({
      title: 'Add link', label: 'Web address or email', confirmLabel: 'Add link', maxLength: 500,
      validate: (v) => (normalizeUrl(v) ? null : 'Enter a web address (https://…) or an email address'),
    });
    const href = raw && normalizeUrl(raw);
    if (!href) return;
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent({ type: 'text', text: raw, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
  }

  // ---- attachments ----
  async function addAttachments() {
    try {
      const res = await getApi().attachments.add({ noteId });
      setAttachments(res.attachments);
      onChanged();
      if (res.added.length) toast({ kind: 'success', text: `${res.added.length} file${res.added.length > 1 ? 's' : ''} attached.` });
      res.failed.forEach((f) => toast({ kind: 'error', title: `Could not attach ${f.name}`, text: f.reason }));
    } catch (e) {
      toast({ kind: 'error', text: errorMessage(e) });
    }
  }
  async function removeAttachment(a) {
    if (!(await confirm({ title: 'Remove attachment?', message: `"${a.original_name}" will be deleted from this note and from disk.`, confirmLabel: 'Remove', danger: true }))) return;
    try {
      const res = await getApi().attachments.remove({ id: a.id });
      setAttachments(res.attachments);
      onChanged();
    } catch (e) {
      toast({ kind: 'error', text: errorMessage(e) });
    }
  }
  const openAttachment = (a) => getApi().attachments.open({ id: a.id }).catch((e) => toast({ kind: 'error', text: errorMessage(e) }));
  const revealAttachment = (a) => getApi().attachments.reveal({ id: a.id }).catch((e) => toast({ kind: 'error', text: errorMessage(e) }));

  if (loadError) {
    return <div className="flex h-full items-center justify-center p-8 text-red-600">Could not open this note: {loadError}</div>;
  }
  if (!note || !meta || !editor) {
    return <div className="flex h-full items-center justify-center text-stone-400" role="status">Loading…</div>;
  }

  const shownUpdated = Math.max(meta.updated_at, savedAt ?? 0);
  const exportItems = ['txt', 'md', 'json', 'pdf'].map((f) => ({
    label: { txt: 'Plain text (.txt)', md: 'Markdown (.md)', json: 'JSON (.json)', pdf: 'PDF (.pdf)' }[f],
    icon: FileText,
    onClick: () => onExport(f),
  }));

  return (
    <article className="flex h-full min-w-0 flex-1 flex-col bg-white dark:bg-stone-900" aria-label="Note editor">
      <header className="flex items-center gap-1 px-6 pb-1 pt-4">
        <input
          ref={titleRef}
          value={title}
          maxLength={300}
          onChange={(e) => { setTitle(e.target.value); queue(noteId, { title: e.target.value }); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editor.commands.focus('start'); } }}
          placeholder="Title"
          aria-label="Note title"
          className="min-w-0 flex-1 bg-transparent text-2xl font-bold outline-none placeholder:text-stone-300 dark:placeholder:text-stone-600"
        />
        <button className={flagBtn(meta.pinned, 'text-sky-600')} aria-pressed={meta.pinned} aria-label={meta.pinned ? 'Unpin note' : 'Pin note'} title={meta.pinned ? 'Unpin' : 'Pin'} onClick={() => updateMeta({ pinned: !meta.pinned })}><Pin className="h-4 w-4" /></button>
        <button className={flagBtn(meta.favorite, 'text-amber-500')} aria-pressed={meta.favorite} aria-label={meta.favorite ? 'Remove from favorites' : 'Add to favorites'} title={meta.favorite ? 'Remove favorite' : 'Favorite'} onClick={() => updateMeta({ favorite: !meta.favorite })}><Star className={`h-4 w-4 ${meta.favorite ? 'fill-amber-400' : ''}`} /></button>
        <button className={flagBtn(meta.urgent, 'text-red-500')} aria-pressed={meta.urgent} aria-label={meta.urgent ? 'Clear urgent' : 'Mark urgent'} title={meta.urgent ? 'Clear urgent' : 'Mark urgent'} onClick={() => updateMeta({ urgent: !meta.urgent })}><Flame className="h-4 w-4" /></button>
        <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" aria-hidden="true" />
        <button className={flagBtn(false)} aria-label="Remind me about this note" title="Remind me" onClick={() => onRemind({ id: noteId, title })}><Bell className="h-4 w-4" /></button>
        <button
          className={flagBtn(false)} aria-label="Export note" title="Export (Ctrl+E)" aria-haspopup="menu"
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left - 120, y: r.bottom + 4 }); }}
        >
          <Download className="h-4 w-4" />
        </button>
        <button className={`${flagBtn(false)} hover:!text-red-600`} aria-label="Delete note" title="Delete note" onClick={() => onDelete([noteId])}><Trash2 className="h-4 w-4" /></button>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 pb-2 text-xs text-stone-500 dark:text-stone-400">
        <span>Edited {formatDateTime(shownUpdated)}</span>
        <label className="flex items-center gap-1">
          Folder
          <select
            value={meta.folder_id}
            onChange={(e) => updateMeta({ folder_id: e.target.value })}
            aria-label="Move note to folder"
            className="rounded border border-stone-200 bg-transparent px-1 py-0.5 dark:border-stone-700"
          >
            {folders.map((f) => <option key={f.id} value={f.id} className="text-stone-900">{f.name}</option>)}
          </select>
        </label>
        <span className="text-stone-400">Ctrl+click opens a link</span>
      </div>

      <TagBar tags={meta.tags} onChange={saveTags} suggestions={allTags} />
      <Toolbar editor={editor} onLink={onLink} />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4" onClick={(e) => { if (e.target === e.currentTarget) editor.commands.focus('end'); }}>
        <EditorContent editor={editor} className="min-h-full" />
      </div>

      <AttachmentBar attachments={attachments} onAdd={addAttachments} onRemove={removeAttachment} onOpen={openAttachment} onReveal={revealAttachment} />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={exportItems} onClose={() => setMenu(null)} />}
    </article>
  );
}
