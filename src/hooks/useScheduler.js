import { useCallback, useEffect, useState } from 'react';
import { getApi } from '../services/api.js';

// Keeps reminders and timers in React state and listens for events that the
// main-process scheduler pushes ("reminder-fired", "timer-done", ...).
export function useScheduler({ onEvent }) {
  const [reminders, setReminders] = useState([]);
  const [timers, setTimers] = useState([]);

  const refresh = useCallback(async () => {
    const api = getApi();
    const [r, t] = await Promise.all([api.reminders.list(), api.timers.list()]);
    setReminders(r);
    setTimers(t);
  }, []);

  useEffect(() => {
    // Events that fired before this window finished loading (for example
    // reminders that expired while the app was closed) are not lost: they stay
    // in the database as "missed", so we report them once at start-up.
    getApi().reminders.list().then((list) => {
      const missed = list.filter((r) => r.status === 'missed');
      if (missed.length) onEvent({ type: 'reminders-missed', reminders: missed });
    }).catch(() => {});
    refresh().catch(() => {});
    const off = getApi().on('scheduler:event', (event) => {
      refresh().catch(() => {});
      onEvent(event);
    });
    return off;
  }, [refresh, onEvent]);

  const api = getApi();
  const act = useCallback(async (fn) => { await fn(); await refresh(); }, [refresh]);

  return {
    reminders,
    timers,
    refresh,
    createReminder: (data) => act(() => api.reminders.create(data)),
    dismissReminder: (id) => act(() => api.reminders.dismiss({ id })),
    cancelReminder: (id) => act(() => api.reminders.cancel({ id })),
    createTimer: (data) => act(() => api.timers.create(data)),
    pauseTimer: (id) => act(() => api.timers.pause({ id })),
    resumeTimer: (id) => act(() => api.timers.resume({ id })),
    cancelTimer: (id) => act(() => api.timers.cancel({ id })),
    dismissTimer: (id) => act(() => api.timers.dismiss({ id })),
  };
}
