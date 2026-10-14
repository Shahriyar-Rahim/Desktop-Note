import { describe, it, expect, beforeEach } from 'vitest';
import { memoryRepo } from './helpers.js';
import { Scheduler } from '../electron/services/scheduler.js';

let now;
let repo;
let events;
let notices;
let scheduler;

beforeEach(() => {
  now = 1_000_000;
  repo = memoryRepo(() => now);
  events = [];
  notices = [];
  scheduler = new Scheduler({
    repo,
    clock: () => now,
    notify: (n) => notices.push(n),
    emit: (e) => events.push(e),
    getSettings: () => ({ desktopNotifications: true }),
  });
});

describe('reminders', () => {
  it('fires a reminder once when it becomes due', () => {
    repo.createReminder({ title: 'Call Sam', dueAt: now + 5000 });
    scheduler.tick();
    expect(events).toHaveLength(0);
    now += 5000;
    scheduler.tick();
    scheduler.tick();
    expect(events.filter((e) => e.type === 'reminder-fired')).toHaveLength(1);
    expect(notices).toEqual([{ title: 'Reminder', body: 'Call Sam' }]);
    expect(repo.listReminders()[0].status).toBe('fired');
  });

  it('rejects reminders in the past', () => {
    expect(() => repo.createReminder({ title: 'x', dueAt: now - 60_000 })).toThrow(/future/);
  });

  it('respects the desktop-notification setting but still emits in-app events', () => {
    scheduler.getSettings = () => ({ desktopNotifications: false });
    repo.createReminder({ title: 'Quiet', dueAt: now + 10 });
    now += 10;
    scheduler.tick();
    expect(events).toHaveLength(1);
    expect(notices).toHaveLength(0);
  });

  it('marks reminders that expired while the app was closed as missed', () => {
    repo.createReminder({ title: 'Old', dueAt: now + 1000 });
    now += 10 * 60_000; // app was closed for ten minutes
    scheduler.recoverExpired();
    expect(events[0].type).toBe('reminders-missed');
    expect(repo.listReminders()[0].status).toBe('missed');
  });

  it('still fires reminders that are only slightly late', () => {
    repo.createReminder({ title: 'Just late', dueAt: now + 1000 });
    now += 20_000;
    scheduler.recoverExpired();
    expect(events).toHaveLength(0);
    scheduler.tick();
    expect(events[0].type).toBe('reminder-fired');
  });
});

describe('timers', () => {
  it('counts down and finishes', () => {
    const t = repo.createTimer({ label: 'Tea', durationMs: 3000 });
    expect(t.state).toBe('running');
    now += 3000;
    scheduler.tick();
    expect(events[0].type).toBe('timer-done');
    expect(repo.getTimer(t.id).state).toBe('done');
  });

  it('pauses, resumes and keeps the remaining time', () => {
    const t = repo.createTimer({ label: 'Focus', durationMs: 10_000 });
    now += 4000;
    const paused = repo.pauseTimer(t.id);
    expect(paused.remaining_ms).toBe(6000);
    now += 60_000; // time passes while paused
    scheduler.tick();
    expect(events).toHaveLength(0);
    const resumed = repo.resumeTimer(t.id);
    expect(resumed.ends_at).toBe(now + 6000);
  });

  it('cancels a timer so it never fires', () => {
    const t = repo.createTimer({ label: 'x', durationMs: 2000 });
    repo.cancelTimer(t.id);
    now += 5000;
    scheduler.tick();
    expect(events).toHaveLength(0);
  });

  it('survives an app restart: a timer that ended while closed is reported', () => {
    repo.createTimer({ label: 'Bread', durationMs: 5000 });
    now += 60_000;
    scheduler.recoverExpired();
    expect(events[0]).toMatchObject({ type: 'timer-done', late: true });
  });

  it('refuses invalid state changes', () => {
    const t = repo.createTimer({ label: 'x', durationMs: 5000 });
    expect(() => repo.resumeTimer(t.id)).toThrow(/paused/);
  });
});
