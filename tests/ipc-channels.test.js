import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { registerIpc } from "../electron/ipc/index.js";
import { createGuardedHandle } from "../electron/security/guard.js";

// The preload allow-list and the main-process handlers must name exactly the
// same channels. This test fails if one side is changed without the other.
describe("IPC channel consistency", () => {
  const preload = fs.readFileSync(
    new URL("../electron/preload.cjs", import.meta.url),
    "utf8",
  );
  const preloadChannels = [...preload.matchAll(/:\s*'([a-zA-Z]+:[a-zA-Z]+)'/g)]
    .map((m) => m[1])
    .filter(
      (c) => !["scheduler:event", "app:beforeClose", "menu:action"].includes(c),
    );

  const ipcMain = { handle() {} };
  const handle = createGuardedHandle(ipcMain, () => true, { error() {} });
  const ctx = new Proxy({}, { get: () => ({}) }); // handlers only read ctx lazily
  const registered = registerIpc(handle, ctx);

  it("every preload channel has a handler", () => {
    const missing = preloadChannels.filter((c) => !registered.includes(c));
    expect(missing).toEqual([]);
  });

  it("every handler is reachable from the preload bridge", () => {
    const unreachable = registered.filter((c) => !preloadChannels.includes(c));
    expect(unreachable).toEqual([]);
  });

  it("exposes events only through an allow-list and never exposes ipcRenderer", () => {
    expect(preload).toMatch(/EVENTS\.includes\(eventName\)/);
    expect(preload).not.toMatch(/exposeInMainWorld\([^)]*ipcRenderer/);
    expect(preload).toMatch(/contextBridge\.exposeInMainWorld\('api'/);
  });
});
