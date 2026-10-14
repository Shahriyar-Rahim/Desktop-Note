import { friendlyError, AppError } from "./errors.js";

// Only pages that belong to our own app may call privileged IPC handlers.
export function createTrustChecker({ devServerUrl, indexFileUrl }) {
  const devOrigin = devServerUrl ? new URL(devServerUrl).origin : null;
  return function isTrustedUrl(urlString) {
    try {
      const url = new URL(urlString);
      if (devOrigin && url.origin === devOrigin) return true;
      return (
        url.protocol === "file:" && url.href.split("#")[0] === indexFileUrl
      );
    } catch {
      return false;
    }
  };
}

// Wrap ipcMain.handle so that every handler:
//   1. rejects calls from untrusted frames,
//   2. returns { ok, data } or { ok:false, error:{code,message} },
//   3. never leaks stack traces or internal messages to the renderer.
export function createGuardedHandle(ipcMain, isTrustedUrl, log = console) {
  const registered = [];
  function handle(channel, fn) {
    registered.push(channel);
    ipcMain.handle(channel, async (event, payload) => {
      try {
        const url = event.senderFrame ? event.senderFrame.url : "";
        if (!isTrustedUrl(url))
          throw new AppError(
            "EUNTRUSTED",
            "Request blocked: untrusted sender.",
          );
        const data = await fn(payload, event);
        return { ok: true, data: data === undefined ? null : data };
      } catch (err) {
        const safe = friendlyError(err);
        if (safe.code === "EINTERNAL")
          log.error(`[ipc] ${channel} failed:`, err);
        return { ok: false, error: { code: safe.code, message: safe.message } };
      }
    });
  }
  handle.registered = registered;
  return handle;
}
