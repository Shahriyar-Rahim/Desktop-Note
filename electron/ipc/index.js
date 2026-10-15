import { registerNoteHandlers } from "./notes.js";
import { registerAttachmentHandlers } from "./attachments.js";
import { registerSchedulingHandlers } from "./scheduling.js";
import { registerBoardHandlers } from "./boards.js";
import { registerSettingsHandlers } from "./settings.js";
import { registerFileHandlers } from "./files.js";
import { registerAppHandlers } from "./app.js";

// `handle` ekta guarded ipcMain.handle wrapper from security/guard.js.
// Every channel name registered here must also appear in preload.cjs.
export function registerIpc(handle, ctx) {
  registerNoteHandlers(handle, ctx);
  registerAttachmentHandlers(handle, ctx);
  registerSchedulingHandlers(handle, ctx);
  registerBoardHandlers(handle, ctx);
  registerSettingsHandlers(handle, ctx);
  registerFileHandlers(handle, ctx);
  registerAppHandlers(handle, ctx);
  return handle.registered;
}
