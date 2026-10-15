// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  isEditableTarget,
  shouldHandleGlobalDelete,
  normalizeUrl,
} from "../src/utils/dom.js";

function key(target, init = {}) {
  return {
    key: "Delete",
    defaultPrevented: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target,
    ...init,
  };
}

describe("global Delete shortcut", () => {
  it("fires when focus is on a neutral element", () => {
    const el = document.createElement("div");
    document.body.append(el);
    expect(shouldHandleGlobalDelete(key(el))).toBe(true);
  });
  it("never fires while typing in inputs, textareas or the editor", () => {
    for (const html of [
      "<input>",
      "<textarea></textarea>",
      '<div contenteditable="true"></div>',
      '<div class="ProseMirror"><p id="p">x</p></div>',
    ]) {
      const wrap = document.createElement("div");
      wrap.innerHTML = html;
      document.body.append(wrap);
      const target = wrap.querySelector("#p") || wrap.firstElementChild;
      expect(isEditableTarget(target)).toBe(true);
      expect(shouldHandleGlobalDelete(key(target))).toBe(false);
    }
  });
  it("ignores other keys, modifiers, already-handled events and open dialogs", () => {
    const el = document.body;
    expect(shouldHandleGlobalDelete(key(el, { key: "Backspace" }))).toBe(false);
    expect(shouldHandleGlobalDelete(key(el, { ctrlKey: true }))).toBe(false);
    expect(shouldHandleGlobalDelete(key(el, { defaultPrevented: true }))).toBe(
      false,
    );
    expect(shouldHandleGlobalDelete(key(el), { dialogOpen: true })).toBe(false);
  });
});

describe("link normalisation", () => {
  it("accepts web and mail links and refuses dangerous schemes", () => {
    expect(normalizeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(normalizeUrl("example.com/path")).toBe("https://example.com/path");
    expect(normalizeUrl("me@example.com")).toBe("mailto:me@example.com");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeUrl("just words")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });
});
