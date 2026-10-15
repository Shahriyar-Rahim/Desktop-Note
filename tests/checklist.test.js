// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { createExtensions } from '../src/features/editor/extensions.js';
import { moveTaskItem, canMoveTaskItem } from '../src/features/editor/moveTaskItem.js';

const LIST = '<ul data-type="taskList">'
  + '<li data-type="taskItem" data-checked="false"><p>one</p></li>'
  + '<li data-type="taskItem" data-checked="true"><p>two</p></li>'
  + '<li data-type="taskItem" data-checked="false"><p>three</p></li></ul>';

function makeEditor(content = LIST) {
  return new Editor({ extensions: createExtensions(), content });
}
function textOrder(editor) {
  const out = [];
  editor.state.doc.descendants((n) => { if (n.type.name === 'paragraph' && n.textContent) out.push(n.textContent); });
  return out;
}
function placeCursorIn(editor, word) {
  let pos = null;
  editor.state.doc.descendants((n, p) => { if (n.isText && n.text === word) pos = p + n.text.length; });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
}

describe('checklists', () => {
  it('parses items with their checked state and survives a save/load round trip', () => {
    const e = makeEditor();
    const html = e.getHTML();
    expect(html).toContain('data-type="taskList"');
    expect((html.match(/data-checked="true"/g) || []).length).toBe(1);
    const again = makeEditor(html);
    expect(again.getHTML()).toBe(html);
  });

  it('toggles an item', () => {
    const e = makeEditor();
    placeCursorIn(e, 'one');
    e.commands.updateAttributes('taskItem', { checked: true });
    expect((e.getHTML().match(/data-checked="true"/g) || []).length).toBe(2);
  });

  it('adds and deletes items', () => {
    const e = makeEditor();
    placeCursorIn(e, 'three');
    e.commands.splitListItem('taskItem');
    e.commands.insertContent('four');
    expect(textOrder(e)).toEqual(['one', 'two', 'three', 'four']);
    placeCursorIn(e, 'four');
    e.commands.liftListItem('taskItem');
    expect(e.getHTML()).not.toContain('<p>four</p></div></li>');
  });

  it('reorders items up and down and respects the edges', () => {
    const e = makeEditor();
    placeCursorIn(e, 'two');
    expect(canMoveTaskItem(e, -1)).toBe(true);
    expect(moveTaskItem(e, -1)).toBe(true);
    expect(textOrder(e)).toEqual(['two', 'one', 'three']);
    expect(canMoveTaskItem(e, -1)).toBe(false);
    expect(moveTaskItem(e, -1)).toBe(false);
    expect(moveTaskItem(e, 1)).toBe(true);
    expect(moveTaskItem(e, 1)).toBe(true);
    expect(textOrder(e)).toEqual(['one', 'three', 'two']);
    expect(canMoveTaskItem(e, 1)).toBe(false);
    // the checked state travels with its item
    const html = e.getHTML();
    expect(html.indexOf('two')).toBeGreaterThan(html.indexOf('three'));
    expect(/data-checked="true"[^>]*>[\s\S]*two/.test(html)).toBe(true);
  });

  it('does nothing outside a checklist', () => {
    const e = makeEditor('<p>plain</p>');
    placeCursorIn(e, 'plain');
    expect(canMoveTaskItem(e, 1)).toBe(false);
  });

  it('undo restores the previous order', () => {
    const e = makeEditor();
    placeCursorIn(e, 'three');
    moveTaskItem(e, -1);
    expect(textOrder(e)).toEqual(['one', 'three', 'two']);
    e.commands.undo();
    expect(textOrder(e)).toEqual(['one', 'two', 'three']);
  });

  it('keeps basic formatting and links safe', () => {
    const e = makeEditor('<p>x</p>');
    e.commands.selectAll();
    e.chain().toggleBold().toggleItalic().toggleUnderline().run();
    expect(e.getHTML()).toMatch(/<strong>.*<em>.*<u>|<u>.*<strong>/);
    e.commands.setContent('<p><a href="javascript:alert(1)">bad</a></p>');
    expect(e.getHTML()).not.toContain('javascript:');
  });
});
