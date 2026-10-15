import { v } from "../security/validate.js";
import { dirOrNull } from "../services/exporter.js";

export function registerSettingsHandlers(handle, ctx) {
  const { repo, dialogs, notify, onSettingsChanged } = ctx;

  handle("settings:get", () => repo.getSettings());

  handle("settings:set", (p) => {
    const { patch } = v.obj(p);
    if (
      patch &&
      "exportDir" in patch &&
      patch.exportDir !== "" &&
      !dirOrNull(patch.exportDir)
    ) {
      // Only an existing directory may be stored.
      delete patch.exportDir;
    }
    const settings = repo.setSettings(patch);
    onSettingsChanged(settings);
    return settings;
  });

  handle("settings:chooseExportDir", async () => {
    const current = dirOrNull(repo.getSettings().exportDir) ?? undefined;
    const dir = await dialogs.openDirectory({
      title: "Default export folder",
      defaultPath: current,
    });
    if (!dir) return repo.getSettings();
    return repo.setSettings({ exportDir: dir });
  });

  handle("settings:testNotification", () =>
    notify({ title: "Desktop Notes", body: "Notifications are working." }),
  );
}
