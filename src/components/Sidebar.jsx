import {
  FileText, Pin, Star, Flame, Folder, FolderPlus, Tag, PenLine, Plus, Settings, Bell,
} from 'lucide-react';

function Item({ icon: Icon, label, count, active, onClick, onContextMenu, accent }) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
        active
          ? 'bg-amber-500/15 font-medium text-amber-900 dark:text-amber-200'
          : 'text-stone-700 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-800'
      }`}
    >
      <Icon className={`h-4 w-4 flex-none ${accent ?? ''}`} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs tabular-nums text-stone-400">{count}</span>}
    </button>
  );
}

function Section({ title, action, children }) {
  return (
    <section className="mt-4">
      <div className="mb-1 flex items-center justify-between px-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">{title}</h2>
        {action}
      </div>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

const iconBtn = 'rounded p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200';

export default function Sidebar({
  data, view, onSelectFilter, onSelectBoard, onNewFolder, onNewBoard,
  onFolderMenu, onBoardMenu, onOpenSettings, onOpenReminders, reminderBadge,
}) {
  const { counts, folders, tags, boards } = data;
  const f = view.type === 'notes' ? view.filter : null;
  const is = (kind, extra) => f && f.kind === kind && (!extra || Object.entries(extra).every(([k, v]) => f[k] === v));

  return (
    <nav aria-label="Library" className="flex h-full w-52 flex-none flex-col border-r border-stone-200 bg-stone-100 p-2 xl:w-60 dark:border-stone-800 dark:bg-stone-950">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <img src="./icon.png" alt="" className="h-6 w-6 rounded-md" />
        <span className="text-sm font-semibold">Desktop Notes</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <Section title="Library">
          <Item icon={FileText} label="All Notes" count={counts.all} active={is('all')} onClick={() => onSelectFilter({ kind: 'all' })} />
          <Item icon={Pin} label="Pinned" count={counts.pinned} active={is('pinned')} onClick={() => onSelectFilter({ kind: 'pinned' })} accent="text-sky-600" />
          <Item icon={Star} label="Favorites" count={counts.favorite} active={is('favorite')} onClick={() => onSelectFilter({ kind: 'favorite' })} accent="text-amber-500" />
          <Item icon={Flame} label="Urgent" count={counts.urgent} active={is('urgent')} onClick={() => onSelectFilter({ kind: 'urgent' })} accent="text-red-500" />
        </Section>

        <Section
          title="Folders"
          action={<button className={iconBtn} aria-label="New folder" title="New folder" onClick={onNewFolder}><FolderPlus className="h-4 w-4" /></button>}
        >
          {folders.map((fo) => (
            <Item
              key={fo.id}
              icon={Folder}
              label={fo.name}
              count={fo.note_count}
              active={is('folder', { folderId: fo.id })}
              onClick={() => onSelectFilter({ kind: 'folder', folderId: fo.id })}
              onContextMenu={(e) => { e.preventDefault(); onFolderMenu(e, fo); }}
            />
          ))}
        </Section>

        {tags.length > 0 && (
          <Section title="Tags">
            {tags.map((t) => (
              <Item key={t.name} icon={Tag} label={t.name} count={t.note_count} active={is('tag', { tag: t.name })} onClick={() => onSelectFilter({ kind: 'tag', tag: t.name })} />
            ))}
          </Section>
        )}

        <Section
          title="Drawing boards"
          action={<button className={iconBtn} aria-label="New drawing board" title="New drawing board" onClick={onNewBoard}><Plus className="h-4 w-4" /></button>}
        >
          {boards.length === 0 && <p className="px-2.5 py-1 text-xs text-stone-400">No boards yet</p>}
          {boards.map((b) => (
            <Item
              key={b.id}
              icon={PenLine}
              label={b.name}
              active={view.type === 'board' && view.id === b.id}
              onClick={() => onSelectBoard(b.id)}
              onContextMenu={(e) => { e.preventDefault(); onBoardMenu(e, b); }}
            />
          ))}
        </Section>
      </div>

      <div className="flex items-center gap-1 border-t border-stone-200 pt-2 dark:border-stone-800">
        <button onClick={onOpenReminders} className="relative flex flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-stone-700 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-800">
          <Bell className="h-4 w-4" aria-hidden="true" /> Reminders
          {reminderBadge > 0 && <span className="ml-auto rounded-full bg-amber-500 px-1.5 text-xs font-medium text-white">{reminderBadge}</span>}
        </button>
        <button onClick={onOpenSettings} className={iconBtn} aria-label="Settings" title="Settings (Ctrl+,)"><Settings className="h-4 w-4" /></button>
      </div>
    </nav>
  );
}
