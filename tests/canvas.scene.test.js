import { describe, it, expect } from 'vitest';
import {
  parseScene, serializeScene, hitTest, topmostAt, moveObject, boundsOf, History, normalizeRect, resolveColor,
} from '../src/features/canvas/scene.js';

const measure = (o) => ({ w: o.text.length * o.size * 0.6, h: o.size * 1.3 });
const stroke = (pts, extra = {}) => ({ id: 's', type: 'stroke', color: 'ink', width: 4, points: pts, ...extra });
const rect = { id: 'r', type: 'rect', color: 'ink', width: 2, x: 100, y: 100, w: 100, h: 60 };
const text = { id: 't', type: 'text', color: 'ink', width: 2, x: 10, y: 10, text: 'Hello', size: 20 };

describe('scene serialisation', () => {
  it('round-trips objects', () => {
    const objs = [stroke([[0, 0], [10, 10]]), rect, text];
    const { objects, dropped, failed } = parseScene(serializeScene(objs));
    expect(failed).toBe(false);
    expect(dropped).toBe(0);
    expect(objects).toEqual(objs);
  });
  it('flags a completely unreadable document without throwing', () => {
    expect(parseScene('{oops').failed).toBe(true);
    expect(parseScene('{"objects":"nope"}').failed).toBe(true);
    expect(parseScene('null').failed).toBe(true);
  });
  it('drops damaged objects but keeps the good ones', () => {
    const json = JSON.stringify({ objects: [
      stroke([[1, 2]]),
      { type: 'stroke', points: [[NaN, 1]] },
      { type: 'wizard' },
      null,
      { type: 'text', text: '   ', x: 1, y: 1 },
      { type: 'rect', x: 'a', y: 2, w: 3, h: 4 },
    ] });
    const r = parseScene(json);
    expect(r.failed).toBe(false);
    expect(r.objects.map((o) => o.type)).toEqual(['stroke', 'rect']);
    expect(r.dropped).toBe(4);
    expect(r.objects[1].x).toBe(0); // non-numeric coordinates are repaired, not trusted
  });
});

describe('hit testing and selection', () => {
  it('hits a stroke near its path, not far from it', () => {
    const s = stroke([[0, 0], [100, 0]]);
    expect(hitTest(s, 50, 3, 4, measure)).toBe(true);
    expect(hitTest(s, 50, 30, 4, measure)).toBe(false);
  });
  it('selects rectangles from the inside but erases only on the outline', () => {
    expect(hitTest(rect, 150, 130, 3, measure, 'select')).toBe(true);
    expect(hitTest(rect, 150, 130, 3, measure, 'erase')).toBe(false);
    expect(hitTest(rect, 100, 130, 3, measure, 'erase')).toBe(true);
  });
  it('hits text inside its bounds', () => {
    expect(hitTest(text, 20, 20, 2, measure)).toBe(true);
    expect(hitTest(text, 300, 300, 2, measure)).toBe(false);
  });
  it('returns the topmost object when objects overlap', () => {
    const below = { ...rect, id: 'below' };
    const above = { ...rect, id: 'above' };
    expect(topmostAt([below, above], 150, 130, 3, measure).id).toBe('above');
    expect(topmostAt([], 1, 1, 3, measure)).toBeNull();
  });
});

describe('moving objects', () => {
  it('moves every object type without mutating the original', () => {
    const s = stroke([[0, 0], [5, 5]]);
    const moved = moveObject(s, 10, 20);
    expect(moved.points).toEqual([[10, 20], [15, 25]]);
    expect(s.points).toEqual([[0, 0], [5, 5]]);
    expect(moveObject({ type: 'line', x1: 0, y1: 0, x2: 5, y2: 5, width: 2 }, 1, 1)).toMatchObject({ x1: 1, y1: 1, x2: 6, y2: 6 });
    expect(moveObject(rect, -50, 0).x).toBe(50);
  });
  it('computes bounds', () => {
    expect(boundsOf(stroke([[5, 5], [15, 25]]))).toEqual({ x: 5, y: 5, w: 10, h: 20 });
    expect(normalizeRect(10, 10, 0, 0)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });
});

describe('undo / redo history', () => {
  it('undoes and redoes snapshots', () => {
    const h = new History();
    let objects = [];
    h.record(objects); objects = [rect];
    h.record(objects); objects = [rect, text];
    objects = h.undo(objects);
    expect(objects).toEqual([rect]);
    objects = h.undo(objects);
    expect(objects).toEqual([]);
    expect(h.undo(objects)).toBeNull();
    objects = h.redo(objects);
    expect(objects).toEqual([rect]);
    expect(h.canRedo).toBe(true);
  });
  it('clears the redo stack after a new action and respects the limit', () => {
    const h = new History(3);
    for (let i = 0; i < 5; i++) h.record([i]);
    expect(h.past).toHaveLength(3);
    h.undo([9]);
    h.record([10]);
    expect(h.canRedo).toBe(false);
  });
});

describe('colours', () => {
  it('maps "ink" to the theme and rejects unsafe colour strings', () => {
    expect(resolveColor('ink', false)).toBe('#1c1917');
    expect(resolveColor('ink', true)).toBe('#f5f5f4');
    expect(resolveColor('url(javascript:x)', false)).toBe('#1c1917');
    expect(resolveColor('#ef4444', true)).toBe('#ef4444');
  });
});
