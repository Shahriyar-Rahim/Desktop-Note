import { v } from "../security/validate.js";
import { AppError } from "../security/errors.js";
import {
  addFiles,
  resolveAttachmentPath,
  removeStoredFiles,
  withMissingFlags,
} from "../services/attachments.js";

export function registerAttachmentHandlers(handle, ctx) {
  const { repo, paths, dialogs, shell } = ctx;

  handle("attachments:add", async (p) => {
    const { noteId } = v.obj(p);
    v.id(noteId, "noteId");
    // The file paths come from the native dialog, never from the renderer.
    const chosen = await dialogs.openFiles({
      title: "Attach files",
      filters: [
        {
          name: "Images and documents",
          extensions: [
            "png",
            "jpg",
            "jpeg",
            "gif",
            "webp",
            "bmp",
            "pdf",
            "txt",
            "md",
            "csv",
            "json",
            "docx",
            "xlsx",
            "pptx",
            "odt",
            "zip",
          ],
        },
      ],
    });
    if (chosen.length === 0)
      return {
        canceled: true,
        added: [],
        failed: [],
        attachments: withMissingFlags(repo, paths.attachmentsDir, noteId),
      };
    const { added, failed } = await addFiles({
      repo,
      attachmentsDir: paths.attachmentsDir,
      noteId,
      paths: chosen,
    });
    return {
      canceled: false,
      added,
      failed,
      attachments: withMissingFlags(repo, paths.attachmentsDir, noteId),
    };
  });

  handle("attachments:remove", async (p) => {
    const { id } = v.obj(p);
    const row = repo.getAttachmentRow(id);
    const stored = repo.deleteAttachment(id);
    await removeStoredFiles(paths.attachmentsDir, [stored]);
    return {
      noteId: row.note_id,
      attachments: withMissingFlags(repo, paths.attachmentsDir, row.note_id),
    };
  });

  handle("attachments:open", async (p) => {
    const { id } = v.obj(p);
    const { full } = resolveAttachmentPath(repo, paths.attachmentsDir, id);
    const err = await shell.openPath(full);
    if (err)
      throw new AppError("EOPEN", "No application could open this file.");
  });

  handle("attachments:reveal", (p) => {
    const { id } = v.obj(p);
    const { full } = resolveAttachmentPath(repo, paths.attachmentsDir, id);
    shell.showItemInFolder(full);
  });
}
