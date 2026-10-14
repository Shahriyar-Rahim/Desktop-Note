import { describe, it, expect } from "vitest";
import path from "node:path";
import { v, validatePatch } from "../electron/security/validate.js";
import {
  safeJoin,
  sanitizeFileName,
  uniqueName,
} from "../electron/security/paths.js";
import {
  createGuardedHandle,
  createTrustChecker,
} from "../electron/security/guard.js";
import { friendlyError } from "../electron/security/errors.js";

describe("validators", () => {
  it("accepts only well-formed ids", () => {
    expect(v.id("abc-123_X")).toBe("abc-123_X");
    for (const bad of ["", "../x", "a b", "x".repeat(65), 5, null, undefined])
      expect(() => v.id(bad)).toThrow();
  });
  it("checks string length, integers and enums", () => {
    expect(() => v.str("x".repeat(11), { max: 10 })).toThrow(/too long/);
    expect(() => v.int(1.5)).toThrow();
    expect(() => v.oneOf("c", ["a", "b"])).toThrow();
  });
  it("rejects unknown keys in patches", () => {
    expect(() => validatePatch({ evil: 1 }, { ok: (x) => x })).toThrow(
      /Unknown field/,
    );
    expect(validatePatch({ ok: 2 }, { ok: (x) => x })).toEqual({ ok: 2 });
  });
});

describe("path safety", () => {
  const base = path.resolve("/tmp/base");
  it("keeps paths inside the base directory", () => {
    expect(safeJoin(base, "a.txt")).toBe(path.join(base, "a.txt"));
    expect(() => safeJoin(base, "../secret")).toThrow(/Invalid file path/);
    expect(() => safeJoin(base, "/etc/passwd")).toThrow();
  });
  it("sanitises file names", () => {
    expect(sanitizeFileName("a/b\\c:d*e?.txt")).toBe("a_b_c_d_e_.txt");
    expect(sanitizeFileName("CON")).toBe("_CON");
    expect(sanitizeFileName("   ")).toBe("untitled");
    expect(sanitizeFileName("x".repeat(200))).toHaveLength(80);
  });
  it("makes duplicate names unique", () => {
    const taken = new Set();
    expect(uniqueName("Note", "md", taken)).toBe("Note.md");
    expect(uniqueName("Note", "md", taken)).toBe("Note (2).md");
  });
});

describe("guarded IPC handle", () => {
  function setup(trusted = true) {
    const handlers = {};
    const ipcMain = {
      handle: (ch, fn) => {
        handlers[ch] = fn;
      },
    };
    const isTrusted = createTrustChecker({
      devServerUrl: null,
      indexFileUrl: "file:///app/dist/index.html",
    });
    const handle = createGuardedHandle(ipcMain, isTrusted, { error() {} });
    handle("t:ok", (p) => ({ echo: p }));
    handle("t:boom", () => {
      throw new Error("secret internal detail");
    });
    handle("t:disk", () => {
      const e = new Error("x");
      e.code = "ENOSPC";
      throw e;
    });
    const call = (ch, payload) =>
      handlers[ch](
        {
          senderFrame: {
            url: trusted
              ? "file:///app/dist/index.html"
              : "https://evil.example/",
          },
        },
        payload,
      );
    return { call };
  }
  it("wraps results in { ok, data }", async () => {
    expect(await setup().call("t:ok", 5)).toEqual({
      ok: true,
      data: { echo: 5 },
    });
  });
  it("blocks untrusted senders", async () => {
    const r = await setup(false).call("t:ok", 1);
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("EUNTRUSTED");
  });
  it("never leaks internal error messages", async () => {
    const r = await setup().call("t:boom");
    expect(r.error.message).not.toMatch(/secret/);
    expect(r.error.code).toBe("EINTERNAL");
  });
  it("translates disk-full errors into friendly text", async () => {
    const r = await setup().call("t:disk");
    expect(r.error.code).toBe("ENOSPC");
    expect(friendlyError({ code: "EACCES" }).message).toMatch(/Permission/);
  });
});
