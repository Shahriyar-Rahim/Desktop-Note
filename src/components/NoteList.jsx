import { useRef } from 'react';
import { Search, Plus, Pin, Star, Flame, Paperclip, ArrowDownAZ, FileText, X, Download, Trash2 } from 'lucide-react';
import EmptyState from './EmptyState.jsx';
import { formatShortDate } from '../utils/format.js';

const SORTS = [
  { value: 'updated', label: 'Date edited' },
  { value: 'created', label: 'Date created' },
  { value: 'title', label: 'Title' },
];

export default function NoteList({
  title, notes, activeId, selectedIds, search, onSearch, searchRef, sort, direction, onSortChange,
  onNew, onSelect, onContextMenu, onDeleteSelected, onExportSelected, onClearSelection, loading,
}) {
  const listRef = useRef(null);

  function onKeyDown(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = notes.findIndex((n) => n.id === activeId);
    const next = notes[Math.min(notes.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (next) {
      onSelect(next.id, {});
      requestAnimationFrame(() => listRef.current?.querySelector(`[data-note-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' }));
    }
  }

  return (
    <section aria-label="Notes" className="flex h-full w-72 flex-none flex-col border-r border-stone-200 bg-white xl:w-80 dark:border-stone-800 dark:bg-stone-900">
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
        <span className="text-xs tabular-nums text-stone-400">{notes.length}</span>
        <button
          onClick={onNew}
          className="rounded-lg bg-amber-600 p-1.5 text-white hover:bg-amber-700"
          aria-label="New note"
          title="New note (Ctrl+N)"
        >
          <Plus className="h-4 w-4" />
        </button>
      </header>

      <div className="flex items-center gap-2 px-3 pb-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-stone-400" aria-hidden="true" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { onSearch(''); e.currentTarget.blur(); } }}
            placeholder="Search notes, folders, tags"
            aria-label="Search notes"
            className="w-full rounded-lg border border-stone-200 bg-stone-50 py-1.5 pl-8 pr-7 text-sm dark:border-stone-700 dark:bg-stone-800"
          />
          {search && (
            <button className="absolute right-1.5 top-1.5 rounded p-0.5 text-stone-400 hover:text-stone-700" aria-label="Clear search" onClick={() => onSearch('')}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <label className="sr-only" htmlFor="sort-select">Sort notes</label>
        <div className="relative">
          <ArrowDownAZ className="pointer-events-none absolute left-1.5 top-2 h-4 w-4 text-stone-400" aria-hidden="true" />
          <select
            id="sort-select"
            value={`${sort}:${direction}`}
            onChange={(e) => { const [s, d] = e.target.value.split(':'); onSortChange(s, d); }}
            className="w-9 appearance-none rounded-lg border border-stone-200 bg-stone-50 py-1.5 pl-7 text-transparent dark:border-stone-700 dark:bg-stone-800"
            title="Sort notes"
          >
            {SORTS.flatMap((s) => [
              <option className="text-stone-900" key={`${s.value}d`} value={`${s.value}:desc`}>{s.label} ↓</option>,
              <option className="text-stone-900" key={`${s.value}a`} value={`${s.value}:asc`}>{s.label} ↑</option>,
            ])}
          </select>
        </div>
      </div>

      {selectedIds.length > 1 && (
        <div className="mx-3 mb-2 flex items-center gap-1 rounded-lg bg-amber-500/15 px-2 py-1 text-sm">
          <span className="flex-1">{selectedIds.length} selected</span>
          <button className="rounded p-1 hover:bg-amber-500/20" title="Export selected" aria-label="Export selected notes" onClick={onExportSelected}><Download className="h-4 w-4" /></button>
          <button className="rounded p-1 text-red-600 hover:bg-amber-500/20" title="Delete selected" aria-label="Delete selected notes" onClick={onDeleteSelected}><Trash2 className="h-4 w-4" /></button>
          <button className="rounded p-1 hover:bg-amber-500/20" title="Clear selection" aria-label="Clear selection" onClick={onClearSelection}><X className="h-4 w-4" /></button>
        </div>
      )}

      <div
        ref={listRef}
        role="listbox"
        aria-label="Note list"
        aria-multiselectable="true"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 outline-none focus-visible:ring-2 focus-visible:ring-amber-600/60"
      >
        {!loading && notes.length === 0 && (
          <EmptyState
            icon={FileText}
            title={search ? 'No matching notes' : 'No notes here yet'}
            text={search ? 'Try a different word, or clear the search.' : 'Press the + button or Ctrl+N to write your first note.'}
          />
        )}
        {notes.map((n) => {
          const selected = selectedIds.includes(n.id);
          const active = n.id === activeId;
          return (
            <div
              key={n.id}
              data-note-id={n.id}
              role="option"
              aria-selected={selected || active}
              onClick={(e) => onSelect(n.id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })}
              onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, n); }}
              className={`mb-0.5 cursor-default rounded-xl px-3 py-2 ${
                active ? 'bg-amber-500/20' : selected ? 'bg-amber-500/10' : 'hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{n.title || 'Untitled'}</span>
                {n.pinned && <Pin className="h-3.5 w-3.5 flex-none text-sky-600" aria-label="Pinned" />}
                {n.favorite && <Star className="h-3.5 w-3.5 flex-none fill-amber-400 text-amber-500" aria-label="Favorite" />}
                {n.urgent && <Flame className="h-3.5 w-3.5 flex-none text-red-500" aria-label="Urgent" />}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                <span className="flex-none">{formatShortDate(n.updated_at)}</span>
                <span className="min-w-0 flex-1 truncate">{n.preview ? n.preview.replace(/\s+/g, ' ') : 'No additional text'}</span>
                {n.attachment_count > 0 && <Paperclip className="h-3 w-3 flex-none" aria-label={`${n.attachment_count} attachments`} />}
              </div>
              {(n.tags.length > 0 || search) && (
                <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                  <span className="rounded bg-stone-200/80 px-1.5 py-px dark:bg-stone-700">{n.folder_name}</span>
                  {n.tags.slice(0, 3).map((t) => <span key={t} className="rounded bg-amber-500/15 px-1.5 py-px text-amber-800 dark:text-amber-300">#{t}</span>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
