import { useState } from 'react';
import { Tag, X } from 'lucide-react';

export default function TagBar({ tags, onChange, suggestions = [] }) {
  const [draft, setDraft] = useState('');

  function add(raw) {
    const name = raw.trim().replace(/^#+/, '');
    if (!name) return;
    if (tags.some((t) => t.toLowerCase() === name.toLowerCase())) { setDraft(''); return; }
    onChange([...tags, name]);
    setDraft('');
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-6 pb-2 text-sm">
      <Tag className="h-4 w-4 text-stone-400" aria-hidden="true" />
      {tags.map((t) => (
        <span key={t} className="flex items-center gap-1 rounded-full bg-amber-500/15 py-0.5 pl-2.5 pr-1 text-xs text-amber-900 dark:text-amber-200">
          #{t}
          <button
            className="rounded-full p-0.5 hover:bg-amber-500/25"
            aria-label={`Remove tag ${t}`}
            onClick={() => onChange(tags.filter((x) => x !== t))}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        list="tag-suggestions"
        maxLength={30}
        onChange={(e) => setDraft(e.target.value.replace(',', ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); }
          else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={() => add(draft)}
        placeholder={tags.length ? 'Add tag' : 'Add a tag…'}
        aria-label="Add tag"
        className="min-w-24 flex-1 bg-transparent py-0.5 text-xs outline-none placeholder:text-stone-400"
      />
      <datalist id="tag-suggestions">
        {suggestions.map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}
