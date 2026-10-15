import { Paperclip, X, ExternalLink, FolderOpen, FileText, TriangleAlert } from 'lucide-react';
import { formatBytes } from '../utils/format.js';

export default function AttachmentBar({ attachments, onAdd, onRemove, onOpen, onReveal }) {
  return (
    <div className="border-t border-stone-200 px-6 py-2 dark:border-stone-800">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium text-stone-500">
        <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
        Attachments{attachments.length ? ` (${attachments.length})` : ''}
        <button onClick={onAdd} className="ml-auto rounded-md border border-stone-300 px-2 py-0.5 text-xs text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800">
          Attach file…
        </button>
      </div>
      {attachments.length === 0 ? (
        <p className="text-xs text-stone-400">Images and documents up to 25 MB are stored next to your notes.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <li key={a.id} className="group relative flex w-44 flex-col overflow-hidden rounded-lg border border-stone-200 bg-stone-50 text-xs dark:border-stone-700 dark:bg-stone-800">
              {a.is_image && !a.missing ? (
                <img src={`note-file://attachment/${a.id}`} alt={a.original_name} className="h-20 w-full cursor-pointer object-cover" onClick={() => onOpen(a)} />
              ) : (
                <div className="flex h-20 items-center justify-center text-stone-400">
                  {a.missing ? <TriangleAlert className="h-7 w-7 text-red-500" aria-label="File missing" /> : <FileText className="h-7 w-7" aria-hidden="true" />}
                </div>
              )}
              <div className="px-2 py-1">
                <div className="truncate font-medium" title={a.original_name}>{a.original_name}</div>
                <div className={a.missing ? 'text-red-600' : 'text-stone-400'}>{a.missing ? 'File is missing from disk' : formatBytes(a.size)}</div>
              </div>
              <div className="absolute right-1 top-1 hidden gap-0.5 rounded-md bg-white/90 p-0.5 shadow group-hover:flex group-focus-within:flex dark:bg-stone-900/90">
                {!a.missing && <button aria-label={`Open ${a.original_name}`} title="Open" onClick={() => onOpen(a)} className="rounded p-1 hover:bg-stone-200 dark:hover:bg-stone-700"><ExternalLink className="h-3.5 w-3.5" /></button>}
                {!a.missing && <button aria-label={`Show ${a.original_name} in folder`} title="Show in folder" onClick={() => onReveal(a)} className="rounded p-1 hover:bg-stone-200 dark:hover:bg-stone-700"><FolderOpen className="h-3.5 w-3.5" /></button>}
                <button aria-label={`Remove ${a.original_name}`} title="Remove" onClick={() => onRemove(a)} className="rounded p-1 text-red-600 hover:bg-stone-200 dark:hover:bg-stone-700"><X className="h-3.5 w-3.5" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
