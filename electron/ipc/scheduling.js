import { v } from "../security/validate.js";

export function registerSchedulingHandlers(handle, ctx) {
  const { repo } = ctx;

  handle("reminders:list", () => repo.listReminders());
  handle("reminders:create", (p) => {
    const { title, dueAt, noteId = null } = v.obj(p);
    return repo.createReminder({ title, dueAt, noteId });
  });
  handle("reminders:dismiss", (p) =>
    repo.setReminderStatus(v.obj(p).id, "dismissed"),
  );
  handle("reminders:cancel", (p) =>
    repo.setReminderStatus(v.obj(p).id, "cancelled"),
  );

  handle("timers:list", () => repo.listTimers());
  handle("timers:create", (p) => {
    const { label, durationMs, noteId = null } = v.obj(p);
    return repo.createTimer({ label, durationMs, noteId });
  });
  handle("timers:pause", (p) => repo.pauseTimer(v.obj(p).id));
  handle("timers:resume", (p) => repo.resumeTimer(v.obj(p).id));
  handle("timers:cancel", (p) => repo.cancelTimer(v.obj(p).id));
  handle("timers:dismiss", (p) => repo.dismissTimer(v.obj(p).id));
}
