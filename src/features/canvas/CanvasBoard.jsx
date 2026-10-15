import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MousePointer2, Pencil, Eraser, Square, Circle, Minus, ArrowUpRight, Type, Undo2, Redo2, Trash2, Download, Eraser as Clear, TriangleAlert,
} from 'lucide-react';
import {
  History, parseScene, serializeScene, topmostAt, moveObject, newId, normalizeRect, renderScene, drawObject,
  textMetrics, exportScenePng, resolveColor, PALETTE, WIDTHS, TEXT_SIZES,
} from './scene.js';
import { storage } from '../../storage/notesStorage.js';
import { getApi, errorMessage } from '../../services/api.js';
import { useAutosave } from '../../hooks/useAutosave.js';
import { useToast } from '../../components/Toasts.jsx';
import { useDialogs } from '../../components/Dialogs.jsx';

const TOOLS = [
  ['select', 'Select and move', MousePointer2],
  ['pen', 'Pen', Pencil],
  ['eraser', 'Eraser', Eraser],
  ['rect', 'Rectangle', Square],
  ['ellipse', 'Ellipse', Circle],
  ['line', 'Line', Minus],
  ['arrow', 'Arrow', ArrowUpRight],
  ['text', 'Text', Type],
];

export default function CanvasBoard({ boardId, isDark, registerFlusher, registerActions, onRenamed, onDeleted }) {
  const toast = useToast();
  const { confirm } = useDialogs();
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const history = useRef(new History());
  const objectsRef = useRef([]);
  const draftRef = useRef(null);
  const dragRef = useRef(null);

  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState('');
  const [objects, setObjectsState] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('ink');
  const [width, setWidth] = useState(4);
  const [textSize, setTextSize] = useState(22);
  const [textEdit, setTextEdit] = useState(null); // { x, y, value }
  const [, bump] = useState(0); // re-render when history availability changes

  const saver = useAutosave((id, patch) => storage.saveBoard(id, patch), { delay: 800 });
  const saverRef = useRef(saver);
  saverRef.current = saver;

  const setObjects = useCallback((next, { save = true } = {}) => {
    objectsRef.current = next;
    setObjectsState(next);
    if (save) saverRef.current.queue(boardId, { data_json: serializeScene(next) });
  }, [boardId]);

  // ---- load ----
  useEffect(() => {
    let cancelled = false;
    setLoaded(false); setFailed(false);
    history.current.clear();
    storage.getBoard(boardId).then((b) => {
      if (cancelled) return;
      setName(b.name);
      const parsed = parseScene(b.data_json);
      if (parsed.failed) { setFailed(true); setObjects([], { save: false }); }
      else {
        setObjects(parsed.objects, { save: false });
        if (parsed.dropped) toast({ kind: 'info', title: 'Some drawing data was damaged', text: `${parsed.dropped} object(s) could not be read and were skipped.`, duration: 8000 });
      }
      setLoaded(true);
    }).catch((e) => { if (!cancelled) { setFailed(true); toast({ kind: 'error', text: errorMessage(e) }); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [boardId, setObjects, toast]);

  useEffect(() => registerFlusher(() => saverRef.current.flush()), [registerFlusher]);

  // ---- drawing ----
  const measure = useCallback((o) => {
    const ctx = canvasRef.current?.getContext('2d');
    return ctx ? textMetrics(ctx, o) : { w: o.text.length * o.size * 0.6, h: o.size * 1.3 };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderScene(ctx, objectsRef.current, { selectedIds, isDark, measure });
    if (draftRef.current) drawObject(ctx, draftRef.current, isDark);
  }, [selectedIds, isDark, measure]);

  useEffect(() => { draw(); }, [draw, objects]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const ro = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const r = wrap.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      draw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw, loaded]);

  const point = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const commit = (before, after) => {
    history.current.record(before);
    setObjects(after);
    bump((n) => n + 1);
  };

  function commitText() {
    if (!textEdit) return;
    const value = textEdit.value.trim();
    setTextEdit(null);
    if (!value) return;
    const obj = { id: newId(), type: 'text', color, width: 2, x: textEdit.x, y: textEdit.y, text: value, size: textSize };
    commit(objectsRef.current, [...objectsRef.current, obj]);
  }

  function onPointerDown(e) {
    if (e.button !== 0 || failed) return;
    if (textEdit) commitText();
    const [x, y] = point(e);
    canvasRef.current.setPointerCapture(e.pointerId);
    wrapRef.current.focus();
    const before = objectsRef.current;

    if (tool === 'pen') {
      draftRef.current = { id: newId(), type: 'stroke', color, width, points: [[x, y]] };
    } else if (tool === 'eraser') {
      dragRef.current = { kind: 'erase', before, changed: false };
      eraseAt(x, y);
    } else if (['rect', 'ellipse', 'line', 'arrow'].includes(tool)) {
      dragRef.current = { kind: 'shape', x, y };
      draftRef.current = shapeFrom(tool, x, y, x, y);
    } else if (tool === 'text') {
      // Open the text box on pointer-UP: the browser's default mouse-down focus
      // handling would otherwise steal focus and close the box immediately.
      dragRef.current = { kind: 'text', x, y };
    } else if (tool === 'select') {
      const hit = topmostAt(objectsRef.current, x, y, 4, measure, 'select');
      if (hit) {
        setSelectedIds([hit.id]);
        dragRef.current = { kind: 'move', id: hit.id, before, lastX: x, lastY: y, moved: false };
      } else {
        setSelectedIds([]);
      }
    }
    draw();
  }

  function shapeFrom(kind, x1, y1, x2, y2) {
    const base = { id: newId(), color, width };
    if (kind === 'rect' || kind === 'ellipse') return { ...base, type: kind, ...rectOf(x1, y1, x2, y2) };
    return { ...base, type: kind, x1, y1, x2, y2 };
  }
  const rectOf = (x1, y1, x2, y2) => { const r = normalizeRect(x1, y1, x2, y2); return { x: r.x, y: r.y, w: r.w, h: r.h }; };

  function eraseAt(x, y) {
    const tol = width * 2 + 4;
    const hit = topmostAt(objectsRef.current, x, y, tol, measure, 'erase');
    if (hit) {
      setObjects(objectsRef.current.filter((o) => o.id !== hit.id));
      dragRef.current.changed = true;
    }
  }

  function onPointerMove(e) {
    const [x, y] = point(e);
    const drag = dragRef.current;
    if (tool === 'pen' && draftRef.current) {
      const pts = draftRef.current.points;
      const last = pts[pts.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) > 1.2) pts.push([x, y]);
      draw();
    } else if (drag?.kind === 'erase') {
      eraseAt(x, y);
    } else if (drag?.kind === 'shape') {
      draftRef.current = shapeFrom(tool, drag.x, drag.y, x, y);
      draw();
    } else if (drag?.kind === 'move') {
      const dx = x - drag.lastX;
      const dy = y - drag.lastY;
      drag.lastX = x; drag.lastY = y; drag.moved = true;
      setObjects(objectsRef.current.map((o) => (o.id === drag.id ? moveObject(o, dx, dy) : o)), { save: false });
    }
  }

  function onPointerUp() {
    const drag = dragRef.current;
    const draft = draftRef.current;
    dragRef.current = null;
    draftRef.current = null;
    if (draft) {
      const tiny = (draft.type === 'rect' || draft.type === 'ellipse') ? draft.w < 3 && draft.h < 3
        : (draft.type === 'line' || draft.type === 'arrow') ? Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) < 3 : false;
      if (!tiny) commit(objectsRef.current, [...objectsRef.current, draft]);
    } else if (drag?.kind === 'text') {
      setTextEdit({ x: drag.x, y: drag.y, value: '' });
    } else if (drag?.kind === 'erase' && drag.changed) {
      history.current.record(drag.before); bump((n) => n + 1);
    } else if (drag?.kind === 'move' && drag.moved) {
      history.current.record(drag.before);
      setObjects(objectsRef.current); // now persist
      bump((n) => n + 1);
    }
    draw();
  }

  // ---- actions ----
  const undo = useCallback(() => {
    const prev = history.current.undo(objectsRef.current);
    if (prev) { setObjects(prev); setSelectedIds([]); bump((n) => n + 1); }
  }, [setObjects]);
  const redo = useCallback(() => {
    const next = history.current.redo(objectsRef.current);
    if (next) { setObjects(next); setSelectedIds([]); bump((n) => n + 1); }
  }, [setObjects]);
  const deleteSelected = useCallback(() => {
    if (!selectedIds.length) return;
    commit(objectsRef.current, objectsRef.current.filter((o) => !selectedIds.includes(o.id)));
    setSelectedIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  useEffect(() => registerActions({ undo, redo }), [registerActions, undo, redo]);
  useEffect(() => () => registerActions(null), [registerActions]);

  async function clearBoard() {
    if (!objectsRef.current.length) return;
    if (!(await confirm({ title: 'Clear this board?', message: 'Every drawing on this board will be removed. You can still undo this with Ctrl+Z right after.', confirmLabel: 'Clear board', danger: true }))) return;
    commit(objectsRef.current, []);
    setSelectedIds([]);
  }

  async function exportPng() {
    try {
      const dataUrl = exportScenePng(objectsRef.current, (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
      const res = await getApi().files.saveImage({ dataUrl, name });
      if (!res.canceled) toast({ kind: 'success', text: 'Drawing exported as PNG.' });
    } catch (e) {
      toast({ kind: 'error', title: 'Export failed', text: errorMessage(e) });
    }
  }

  async function rename(value) {
    const v = value.trim();
    if (!v || v === name) { setName((n) => n); return; }
    try { await storage.saveBoard(boardId, { name: v }); setName(v); onRenamed(); } catch (e) { toast({ kind: 'error', text: errorMessage(e) }); }
  }

  function onKeyDown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) redo(); else undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length && !textEdit) { e.preventDefault(); e.stopPropagation(); deleteSelected(); }
    else if (e.key === 'Escape') { setSelectedIds([]); setTextEdit(null); }
  }

  const btn = (active) => `rounded-lg p-1.5 ${active ? 'bg-amber-500/25 text-amber-900 dark:text-amber-200' : 'text-stone-600 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-700'} disabled:opacity-30`;

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-white dark:bg-stone-900" aria-label="Drawing board">
      <header className="flex items-center gap-2 border-b border-stone-200 px-4 py-2 dark:border-stone-800">
        <input
          defaultValue={name} key={name} maxLength={80} aria-label="Board name"
          onBlur={(e) => rename(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
        />
        <span className="text-xs text-stone-400" role="status" data-testid="board-save-status">
          {saver.status === 'saving' ? 'Saving…' : saver.status === 'pending' ? 'Unsaved…' : saver.status === 'error' ? 'Save failed' : 'Saved'}
        </span>
        <button className={btn(false)} aria-label="Export drawing as PNG" title="Export as PNG" onClick={exportPng}><Download className="h-4 w-4" /></button>
        <button className={`${btn(false)} hover:!text-red-600`} aria-label="Delete board" title="Delete board" onClick={onDeleted}><Trash2 className="h-4 w-4" /></button>
      </header>

      <div role="toolbar" aria-label="Drawing tools" className="flex flex-wrap items-center gap-1 border-b border-stone-200 px-4 py-1.5 dark:border-stone-800">
        {TOOLS.map(([id, label, Icon]) => (
          <button key={id} className={btn(tool === id)} aria-label={label} aria-pressed={tool === id} title={label} onClick={() => setTool(id)}><Icon className="h-4 w-4" /></button>
        ))}
        <span className="mx-2 h-5 w-px bg-stone-200 dark:bg-stone-700" aria-hidden="true" />
        {PALETTE.map((c) => (
          <button key={c} aria-label={`Colour ${c === 'ink' ? 'default ink' : c}`} aria-pressed={color === c} title={c === 'ink' ? 'Ink' : c} onClick={() => setColor(c)}
            className={`h-5 w-5 rounded-full border-2 ${color === c ? 'border-amber-600' : 'border-transparent ring-1 ring-stone-300 dark:ring-stone-600'}`}
            style={{ background: resolveColor(c, isDark) }} />
        ))}
        <span className="mx-2 h-5 w-px bg-stone-200 dark:bg-stone-700" aria-hidden="true" />
        {tool === 'text'
          ? TEXT_SIZES.map((s) => <button key={s} className={`${btn(textSize === s)} text-xs`} aria-pressed={textSize === s} aria-label={`Text size ${s}`} onClick={() => setTextSize(s)}>{s}</button>)
          : WIDTHS.map((w) => (
            <button key={w} className={btn(width === w)} aria-pressed={width === w} aria-label={`Line width ${w}`} title={`Line width ${w}`} onClick={() => setWidth(w)}>
              <span className="block rounded-full bg-current" style={{ width: 16, height: Math.max(2, w) }} />
            </button>
          ))}
        <span className="mx-2 h-5 w-px bg-stone-200 dark:bg-stone-700" aria-hidden="true" />
        <button className={btn(false)} aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.current.canUndo} onClick={undo}><Undo2 className="h-4 w-4" /></button>
        <button className={btn(false)} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!history.current.canRedo} onClick={redo}><Redo2 className="h-4 w-4" /></button>
        <button className={btn(false)} aria-label="Delete selected object" title="Delete selected (Delete)" disabled={!selectedIds.length} onClick={deleteSelected}><Trash2 className="h-4 w-4" /></button>
        <button className={btn(false)} aria-label="Clear board" title="Clear board" disabled={!objects.length} onClick={clearBoard}><Clear className="h-4 w-4" /></button>
      </div>

      <div
        ref={wrapRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Drawing canvas"
        className="relative min-h-0 flex-1 touch-none overflow-hidden bg-stone-50 outline-none dark:bg-stone-900"
        style={{ backgroundImage: 'radial-gradient(circle, rgb(120 113 108 / 0.25) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      >
        <canvas
          ref={canvasRef}
          data-testid="board-canvas"
          className={`absolute inset-0 ${tool === 'select' ? 'cursor-default' : tool === 'text' ? 'cursor-text' : 'cursor-crosshair'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {textEdit && (
          <textarea
            autoFocus
            value={textEdit.value}
            onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
            onBlur={commitText}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); }
              if (e.key === 'Escape') setTextEdit(null);
            }}
            aria-label="Text object"
            rows={1}
            placeholder="Type…"
            style={{ left: textEdit.x, top: textEdit.y, fontSize: textSize, color: resolveColor(color, isDark) }}
            className="absolute min-w-24 resize-none rounded border border-dashed border-amber-500 bg-transparent p-0 leading-[1.3] outline-none"
          />
        )}
        {failed && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 p-6 text-center dark:bg-stone-900/90" role="alert">
            <div className="max-w-sm">
              <TriangleAlert className="mx-auto mb-2 h-8 w-8 text-red-500" aria-hidden="true" />
              <p className="mb-1 font-medium">This board's drawing data could not be read.</p>
              <p className="mb-3 text-sm text-stone-500">Nothing has been overwritten. An earlier copy may exist in your database backups (Settings → Data safety).</p>
              <button className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm text-white" onClick={() => { setFailed(false); setObjects([], { save: true }); }}>Start with an empty board</button>
            </div>
          </div>
        )}
        {loaded && !failed && objects.length === 0 && !textEdit && (
          <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-stone-400">Pick a tool and start drawing. Everything saves automatically.</p>
        )}
      </div>
    </section>
  );
}
