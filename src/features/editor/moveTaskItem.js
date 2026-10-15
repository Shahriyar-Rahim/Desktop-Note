import { TextSelection } from '@tiptap/pm/state';

// Find the checklist item that contains the cursor.
function findTaskItemDepth($pos) {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === 'taskItem') return d;
  }
  return null;
}

export function canMoveTaskItem(editor, direction) {
  const { $from } = editor.state.selection;
  const depth = findTaskItemDepth($from);
  if (depth === null) return false;
  const listDepth = depth - 1;
  const index = $from.index(listDepth);
  const target = index + direction;
  return target >= 0 && target < $from.node(listDepth).childCount;
}

// direction: -1 moves the current checklist item up, +1 moves it down.
// Implemented as one ProseMirror transaction, so undo/redo restores it.
export function moveTaskItem(editor, direction) {
  if (!canMoveTaskItem(editor, direction)) return false;
  const { state, view } = editor;
  const { $from } = state.selection;
  const listDepth = findTaskItemDepth($from) - 1;
  const list = $from.node(listDepth);
  const index = $from.index(listDepth);
  const other = index + direction;

  const starts = [];
  let pos = $from.start(listDepth);
  list.forEach((child) => { starts.push(pos); pos += child.nodeSize; });

  const first = Math.min(index, other);
  const second = Math.max(index, other);
  const nodeFirst = list.child(first);
  const nodeSecond = list.child(second);
  const from = starts[first];
  const to = starts[second] + nodeSecond.nodeSize;

  const tr = state.tr.replaceWith(from, to, [nodeSecond, nodeFirst]);
  const movedStart = direction === -1 ? from : from + nodeSecond.nodeSize;
  tr.setSelection(TextSelection.near(tr.doc.resolve(movedStart + 2)));
  view.dispatch(tr.scrollIntoView());
  return true;
}
