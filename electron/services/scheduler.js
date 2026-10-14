export class Scheduler {
  constructor({
    repo,
    notify,
    emit,
    getSettings,
    clock = Date.now,
    graceMs = 60_000,
  }) {
    this.repo = repo;
    this.notify = notify; // ({title, body}) => void   (desktop notification)
    this.emit = emit; // (event) => void              (in-app notification)
    this.getSettings = getSettings;
    this.clock = clock;
    this.graceMs = graceMs;
    this.timer = null;
  }

  // Called once at startup. Reminders that expired while the app was closed
  // are marked "missed" (not silently deleted) and reported to the UI.
  recoverExpired() {
    const now = this.clock();
    const overdue = this.repo.dueReminders(now);
    const missed = overdue.filter((r) => now - r.due_at > this.graceMs);
    if (missed.length) {
      this.repo.markReminders(
        missed.map((r) => r.id),
        "missed",
        now,
      );
      this.emit({
        type: "reminders-missed",
        reminders: missed.map((r) => ({ ...r, status: "missed" })),
      });
      if (this.getSettings().desktopNotifications) {
        this.notify({
          title: "Missed reminders",
          body: `${missed.length} reminder${missed.length > 1 ? "s" : ""} expired while the app was closed.`,
        });
      }
    }
    // Timers that ran out while the app was closed.
    const expiredTimers = this.repo.dueTimers(now);
    if (expiredTimers.length) {
      this.repo.markTimersDone(expiredTimers.map((t) => t.id));
      for (const t of expiredTimers)
        this.emit({
          type: "timer-done",
          timer: { ...t, state: "done" },
          late: true,
        });
    }
  }

  tick() {
    const now = this.clock();
    const dueReminders = this.repo.dueReminders(now);
    if (dueReminders.length) {
      this.repo.markReminders(
        dueReminders.map((r) => r.id),
        "fired",
        now,
      );
      for (const r of dueReminders) {
        this.emit({
          type: "reminder-fired",
          reminder: { ...r, status: "fired", fired_at: now },
        });
        if (this.getSettings().desktopNotifications)
          this.notify({ title: "Reminder", body: r.title });
      }
    }
    const dueTimers = this.repo.dueTimers(now);
    if (dueTimers.length) {
      this.repo.markTimersDone(dueTimers.map((t) => t.id));
      for (const t of dueTimers) {
        this.emit({
          type: "timer-done",
          timer: { ...t, state: "done" },
          late: false,
        });
        if (this.getSettings().desktopNotifications)
          this.notify({ title: "Timer finished", body: t.label });
      }
    }
  }

  start(intervalMs = 1000) {
    this.recoverExpired();
    this.stop();
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        console.error("[scheduler] tick failed", err);
      }
    }, intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
