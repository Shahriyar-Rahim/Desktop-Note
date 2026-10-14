import path from "node:path";
import { AppError } from "./errors.js";

export function safeJoin(baseDir, ...parts) {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, ...parts);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new AppError("EPATH", "Invalid file path.");
  }
  return target;
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

// Turn arbitrary text (a note title) into a safe file name.
export function sanitizeFileName(name, fallback = "untitled") {
  let s = String(name ?? "")
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  if (WINDOWS_RESERVED.test(s)) s = `_${s}`;
  s = s.slice(0, 80).replace(/[. ]+$/, "");
  return s || fallback;
}

export function extOf(fileName) {
  return path.extname(String(fileName)).slice(1).toLowerCase();
}

// Pick a file name that does not exist yet inside `taken` (a Set of names).
export function uniqueName(base, ext, taken) {
  let candidate = `${base}.${ext}`;
  let i = 2;
  while (taken.has(candidate.toLowerCase()))
    candidate = `${base} (${i++}).${ext}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}
