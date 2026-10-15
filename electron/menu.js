import { Menu } from "electron";

// Menu items that need the React UI send an allow-listed action name.
// Accelerators that the editor itself handles (Ctrl+B, Ctrl+I, Ctrl+Z ...) are
// intentionally NOT in the menu so they never conflict with text editing.
export function buildMenu({ send, isDev, platform }) {
  const mac = platform === "darwin";
  const action = (name) => () => send("menu:action", name);
  const template = [
    ...(mac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Note",
          accelerator: "CmdOrCtrl+N",
          click: action("new-note"),
        },
        {
          label: "New Folder",
          accelerator: "CmdOrCtrl+Shift+N",
          click: action("new-folder"),
        },
        { label: "New Drawing Board", click: action("new-board") },
        { type: "separator" },
        {
          label: "Save Now",
          accelerator: "CmdOrCtrl+S",
          click: action("save"),
        },
        { type: "separator" },
        {
          label: "Export Current Note…",
          accelerator: "CmdOrCtrl+E",
          click: action("export-note"),
        },
        { label: "Export All Notes (Backup)…", click: action("export-backup") },
        { label: "Import…", click: action("import") },
        { type: "separator" },
        {
          label: "Settings…",
          accelerator: "CmdOrCtrl+,",
          click: action("settings"),
        },
        { type: "separator" },
        mac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", click: action("undo") },
        { label: "Redo", click: action("redo") },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        {
          label: "Find in Notes",
          accelerator: "CmdOrCtrl+F",
          click: action("find"),
        },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Dark Mode",
          accelerator: "CmdOrCtrl+Shift+D",
          click: action("toggle-theme"),
        },
        {
          label: "Reminders and Timers",
          accelerator: "CmdOrCtrl+Shift+R",
          click: action("reminders"),
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "togglefullscreen" },
        ...(isDev ? [{ type: "separator" }, { role: "toggleDevTools" }] : []),
      ],
    },
    { role: "windowMenu" },
  ];
  return Menu.buildFromTemplate(template);
}
