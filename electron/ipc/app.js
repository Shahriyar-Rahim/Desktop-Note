import fs from "node:fs";
import { v } from "../security/validate.js";
import { AppError } from "../security/errors.js";
import {
  createBackup,
  listBackups,
  pruneBackups,
} from "../services/database.js";

export function registerAppHandlers(handle, ctx) {
  const { db, paths, shell, appInfo, requestClose } = ctx;

  handle("app:getInfo", () => appInfo());

  handle("app:readyToClose", () => requestClose());

  handle("app:openExternal", async (p) => {
    const { url } = v.obj(p);
    v.str(url, { name: "url", max: 2048 });
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new AppError("EVALIDATION", "Invalid link.");
    }
    if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) {
      throw new AppError(
        "EVALIDATION",
        "Only http, https and mailto links can be opened.",
      );
    }
    await shell.openExternal(parsed.href);
  });

  handle("data:createBackup", () => {
    const file = createBackup(db, paths.backupDir, "manual");
    pruneBackups(paths.backupDir, 10);
    return { name: file.split(/[\\/]/).pop() };
  });

  handle("data:listBackups", () =>
    listBackups(paths.backupDir).map((b) => ({
      name: b.name,
      size: b.size,
      mtime: b.mtime,
    })),
  );

  handle("data:openBackupFolder", async () => {
    fs.mkdirSync(paths.backupDir, { recursive: true });
    await shell.openPath(paths.backupDir);
  });
}
