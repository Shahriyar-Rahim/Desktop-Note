import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TaskList, TaskItem } from '@tiptap/extension-list';

// StarterKit already contains: paragraph, headings, bold, italic, underline,
// strike, code, code block, blockquote, bullet/ordered lists, link, history.
export function createExtensions({ placeholder = 'Start writing…' } = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false, // we open links ourselves through the main process
        autolink: true,
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: { rel: 'noopener noreferrer nofollow' },
      },
    }),
    TaskList,
    TaskItem.configure({ nested: false }),
    Placeholder.configure({ placeholder }),
  ];
}
