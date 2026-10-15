import {
  Bold, Italic, Underline, Strikethrough, Heading1, Heading2, Heading3, List, ListOrdered, ListChecks,
  Link as LinkIcon, Link2Off, Code, SquareCode, Quote, Undo2, Redo2, ArrowUp, ArrowDown,
} from 'lucide-react';
import { useEditorState } from '@tiptap/react';
import { canMoveTaskItem, moveTaskItem } from '../features/editor/moveTaskItem.js';

function Btn({ icon: Icon, label, onClick, active, disabled, shortcut }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep the editor selection
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`rounded-md p-1.5 transition-colors disabled:opacity-30 ${
        active ? 'bg-amber-500/25 text-amber-900 dark:text-amber-200' : 'text-stone-600 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-700'
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" aria-hidden="true" />;

export default function Toolbar({ editor, onLink }) {
  // Re-render only when something the toolbar shows actually changes.
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'),
      strike: e.isActive('strike'), code: e.isActive('code'), codeBlock: e.isActive('codeBlock'),
      h1: e.isActive('heading', { level: 1 }), h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), task: e.isActive('taskList'),
      quote: e.isActive('blockquote'), link: e.isActive('link'),
      canUndo: e.can().undo(), canRedo: e.can().redo(),
      canUp: canMoveTaskItem(e, -1), canDown: canMoveTaskItem(e, 1),
    }),
  });
  const run = () => editor.chain().focus();

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-stone-200 px-3 py-1.5 dark:border-stone-800">
      <Btn icon={Undo2} label="Undo" shortcut="Ctrl+Z" disabled={!s.canUndo} onClick={() => run().undo().run()} />
      <Btn icon={Redo2} label="Redo" shortcut="Ctrl+Shift+Z" disabled={!s.canRedo} onClick={() => run().redo().run()} />
      <Sep />
      <Btn icon={Heading1} label="Heading 1" active={s.h1} onClick={() => run().toggleHeading({ level: 1 }).run()} />
      <Btn icon={Heading2} label="Heading 2" active={s.h2} onClick={() => run().toggleHeading({ level: 2 }).run()} />
      <Btn icon={Heading3} label="Heading 3" active={s.h3} onClick={() => run().toggleHeading({ level: 3 }).run()} />
      <Sep />
      <Btn icon={Bold} label="Bold" shortcut="Ctrl+B" active={s.bold} onClick={() => run().toggleBold().run()} />
      <Btn icon={Italic} label="Italic" shortcut="Ctrl+I" active={s.italic} onClick={() => run().toggleItalic().run()} />
      <Btn icon={Underline} label="Underline" shortcut="Ctrl+U" active={s.underline} onClick={() => run().toggleUnderline().run()} />
      <Btn icon={Strikethrough} label="Strikethrough" active={s.strike} onClick={() => run().toggleStrike().run()} />
      <Sep />
      <Btn icon={List} label="Bulleted list" active={s.bullet} onClick={() => run().toggleBulletList().run()} />
      <Btn icon={ListOrdered} label="Numbered list" active={s.ordered} onClick={() => run().toggleOrderedList().run()} />
      <Btn icon={ListChecks} label="Checklist" active={s.task} onClick={() => run().toggleTaskList().run()} />
      {s.task && (
        <>
          <Btn icon={ArrowUp} label="Move checklist item up" disabled={!s.canUp} onClick={() => moveTaskItem(editor, -1)} />
          <Btn icon={ArrowDown} label="Move checklist item down" disabled={!s.canDown} onClick={() => moveTaskItem(editor, 1)} />
        </>
      )}
      <Sep />
      <Btn icon={s.link ? Link2Off : LinkIcon} label={s.link ? 'Remove link' : 'Add link'} active={s.link} onClick={onLink} />
      <Btn icon={Code} label="Inline code" active={s.code} onClick={() => run().toggleCode().run()} />
      <Btn icon={SquareCode} label="Code block" active={s.codeBlock} onClick={() => run().toggleCodeBlock().run()} />
      <Btn icon={Quote} label="Quote" active={s.quote} onClick={() => run().toggleBlockquote().run()} />
    </div>
  );
}
