// Pure drawing-scene logic: data model, hit testing, history, (de)serialisation.
// Nothing here touches React or the DOM, so it is easy to unit-test.

export const SCENE_VERSION = 1;
export const MAX_OBJECTS = 5000;
export const MAX_POINTS = 20000;
export const PALETTE = ['ink', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];
export const WIDTHS = [2, 4, 8];
export const TEXT_SIZES = [16, 22, 32];

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().slice(0, 12);
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// "ink" adapts to the theme: dark ink on light paper, light ink on dark paper.
export function resolveColor(color, isDark) {
  if (color === 'ink') return isDark ? '#f5f5f4' : '#1c1917';
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : isDark ? '#f5f5f4' : '#1c1917';
}

const fin = (x, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ---------- (de)serialisation ----------
function sanitizeObject(o) {
  if (!o || typeof o !== 'object' || typeof o.type !== 'string') return null;
  const base = {
    id: typeof o.id === 'string' && o.id ? o.id.slice(0, 40) : newId(),
    type: o.type,
    color: typeof o.color === 'string' ? o.color : 'ink',
    width: clamp(fin(o.width, 2), 1, 24),
  };
  switch (o.type) {
    case 'stroke': {
      if (!Array.isArray(o.points) || o.points.length === 0) return null;
      const points = o.points
        .slice(0, MAX_POINTS)
        .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .map((p) => [p[0], p[1]]);
      return points.length ? { ...base, points } : null;
    }
    case 'rect':
    case 'ellipse':
      return { ...base, x: fin(o.x), y: fin(o.y), w: fin(o.w), h: fin(o.h) };
    case 'line':
    case 'arrow':
      return { ...base, x1: fin(o.x1), y1: fin(o.y1), x2: fin(o.x2), y2: fin(o.y2) };
    case 'text': {
      if (typeof o.text !== 'string' || !o.text.trim()) return null;
      return { ...base, x: fin(o.x), y: fin(o.y), text: o.text.slice(0, 2000), size: clamp(fin(o.size, 22), 8, 96) };
    }
    default:
      return null;
  }
}

// Never throws. Returns { objects, dropped, failed } where failed is true when
// the whole document could not be read (the UI then refuses to overwrite it).
export function parseScene(json) {
  let raw;
  try {
    raw = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    return { objects: [], dropped: 0, failed: true };
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.objects)) {
    return { objects: [], dropped: 0, failed: true };
  }
  const objects = [];
  let dropped = 0;
  for (const o of raw.objects.slice(0, MAX_OBJECTS)) {
    const clean = sanitizeObject(o);
    if (clean) objects.push(clean); else dropped += 1;
  }
  dropped += Math.max(0, raw.objects.length - MAX_OBJECTS);
  return { objects, dropped, failed: false };
}

export function serializeScene(objects) {
  return JSON.stringify({ version: SCENE_VERSION, objects });
}

// ---------- geometry ----------
export function normalizeRect(x1, y1, x2, y2) {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// measure(obj) -> { w, h } is supplied by the caller for text objects.
export function boundsOf(obj, measure) {
  switch (obj.type) {
    case 'stroke': {
      const xs = obj.points.map((p) => p[0]);
      const ys = obj.points.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case 'rect':
    case 'ellipse':
      return normalizeRect(obj.x, obj.y, obj.x + obj.w, obj.y + obj.h);
    case 'line':
    case 'arrow':
      return normalizeRect(obj.x1, obj.y1, obj.x2, obj.y2);
    case 'text': {
      const m = measure ? measure(obj) : { w: obj.text.length * obj.size * 0.6, h: obj.size * 1.3 };
      return { x: obj.x, y: obj.y, w: m.w, h: m.h };
    }
    default:
      return { x: 0, y: 0, w: 0, h: 0 };
  }
}

// mode 'select': the inside of shapes counts as a hit.
// mode 'erase' : only the outline counts, so a big rectangle does not vanish
//                when you erase something drawn inside it.
export function hitTest(obj, x, y, tol, measure, mode = 'select') {
  const reach = tol + obj.width / 2;
  switch (obj.type) {
    case 'stroke': {
      if (obj.points.length === 1) return Math.hypot(x - obj.points[0][0], y - obj.points[0][1]) <= reach;
      for (let i = 1; i < obj.points.length; i++) {
        const a = obj.points[i - 1];
        const b = obj.points[i];
        if (distToSegment(x, y, a[0], a[1], b[0], b[1]) <= reach) return true;
      }
      return false;
    }
    case 'line':
    case 'arrow':
      return distToSegment(x, y, obj.x1, obj.y1, obj.x2, obj.y2) <= reach;
    case 'rect': {
      const b = normalizeRect(obj.x, obj.y, obj.x + obj.w, obj.y + obj.h);
      const inside = x >= b.x - reach && x <= b.x + b.w + reach && y >= b.y - reach && y <= b.y + b.h + reach;
      if (!inside) return false;
      if (mode === 'select') return true;
      const nearEdge = x <= b.x + reach || x >= b.x + b.w - reach || y <= b.y + reach || y >= b.y + b.h - reach;
      return nearEdge;
    }
    case 'ellipse': {
      const b = normalizeRect(obj.x, obj.y, obj.x + obj.w, obj.y + obj.h);
      const rx = b.w / 2 + reach;
      const ry = b.h / 2 + reach;
      if (rx <= 0 || ry <= 0) return false;
      const nx = (x - (b.x + b.w / 2)) / rx;
      const ny = (y - (b.y + b.h / 2)) / ry;
      const d = nx * nx + ny * ny;
      if (mode === 'select') return d <= 1;
      const irx = Math.max(0.0001, b.w / 2 - reach);
      const iry = Math.max(0.0001, b.h / 2 - reach);
      const inner = ((x - (b.x + b.w / 2)) / irx) ** 2 + ((y - (b.y + b.h / 2)) / iry) ** 2;
      return d <= 1 && inner >= 1;
    }
    case 'text': {
      const b = boundsOf(obj, measure);
      return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol;
    }
    default:
      return false;
  }
}

// Objects are drawn in array order, so the LAST one is on top.
export function topmostAt(objects, x, y, tol, measure, mode = 'select') {
  for (let i = objects.length - 1; i >= 0; i--) {
    if (hitTest(objects[i], x, y, tol, measure, mode)) return objects[i];
  }
  return null;
}

export function moveObject(obj, dx, dy) {
  switch (obj.type) {
    case 'stroke':
      return { ...obj, points: obj.points.map((p) => [p[0] + dx, p[1] + dy]) };
    case 'line':
    case 'arrow':
      return { ...obj, x1: obj.x1 + dx, y1: obj.y1 + dy, x2: obj.x2 + dx, y2: obj.y2 + dy };
    default:
      return { ...obj, x: obj.x + dx, y: obj.y + dy };
  }
}

// ---------- history (undo / redo) ----------
// Stores whole snapshots of the objects array. Objects are never mutated,
// so snapshots share unchanged objects and cost very little memory.
export class History {
  constructor(limit = 100) {
    this.limit = limit;
    this.past = [];
    this.future = [];
  }
  record(snapshot) {
    this.past.push(snapshot);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
  undo(current) {
    if (!this.past.length) return null;
    this.future.push(current);
    return this.past.pop();
  }
  redo(current) {
    if (!this.future.length) return null;
    this.past.push(current);
    return this.future.pop();
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  clear() { this.past = []; this.future = []; }
}

// ---------- rendering ----------
export function textMetrics(ctx, obj) {
  ctx.font = `${obj.size}px system-ui, sans-serif`;
  const lines = obj.text.split('\n');
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
  return { w, h: lines.length * obj.size * 1.3 };
}

function drawArrowHead(ctx, x1, y1, x2, y2, size) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

export function drawObject(ctx, obj, isDark) {
  ctx.save();
  ctx.strokeStyle = resolveColor(obj.color, isDark);
  ctx.fillStyle = resolveColor(obj.color, isDark);
  ctx.lineWidth = obj.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (obj.type) {
    case 'stroke': {
      ctx.beginPath();
      const [first, ...rest] = obj.points;
      ctx.moveTo(first[0], first[1]);
      if (rest.length === 0) ctx.lineTo(first[0] + 0.01, first[1]);
      for (const p of rest) ctx.lineTo(p[0], p[1]);
      ctx.stroke();
      break;
    }
    case 'rect':
      ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(obj.x + obj.w / 2, obj.y + obj.h / 2, Math.abs(obj.w / 2), Math.abs(obj.h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'line':
      ctx.beginPath();
      ctx.moveTo(obj.x1, obj.y1);
      ctx.lineTo(obj.x2, obj.y2);
      ctx.stroke();
      break;
    case 'arrow':
      ctx.beginPath();
      ctx.moveTo(obj.x1, obj.y1);
      ctx.lineTo(obj.x2, obj.y2);
      ctx.stroke();
      drawArrowHead(ctx, obj.x1, obj.y1, obj.x2, obj.y2, 10 + obj.width * 2);
      break;
    case 'text': {
      ctx.font = `${obj.size}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      obj.text.split('\n').forEach((line, i) => ctx.fillText(line, obj.x, obj.y + i * obj.size * 1.3));
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

export function renderScene(ctx, objects, { selectedIds = [], isDark = false, measure } = {}) {
  for (const obj of objects) drawObject(ctx, obj, isDark);
  ctx.save();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  for (const obj of objects) {
    if (!selectedIds.includes(obj.id)) continue;
    const b = boundsOf(obj, measure);
    const pad = 6 + obj.width / 2;
    ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
  }
  ctx.restore();
}

// Render all objects to an offscreen canvas and return a PNG data URL.
export function exportScenePng(objects, createCanvas) {
  if (!objects.length) throw new Error('The board is empty - there is nothing to export.');
  const canvas = createCanvas(1, 1);
  const mctx = canvas.getContext('2d');
  const measure = (o) => textMetrics(mctx, o);
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const o of objects) {
    const b = boundsOf(o, measure);
    const pad = o.width + 4;
    minX = Math.min(minX, b.x - pad);
    minY = Math.min(minY, b.y - pad);
    maxX = Math.max(maxX, b.x + b.w + pad);
    maxY = Math.max(maxY, b.y + b.h + pad);
  }
  const margin = 24;
  const w = Math.ceil(Math.min(8000, maxX - minX + margin * 2));
  const h = Math.ceil(Math.min(8000, maxY - minY + margin * 2));
  const out = createCanvas(w, h);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.translate(margin - minX, margin - minY);
  renderScene(ctx, objects, { isDark: false, measure: (o) => textMetrics(ctx, o) });
  return out.toDataURL('image/png');
}
