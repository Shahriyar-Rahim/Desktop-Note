export function formatDateTime(ms, now = Date.now()) {
  if (!ms) return "";
  const d = new Date(ms);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Today, ${time}`;
  const yesterday =
    new Date(now - 86_400_000).toDateString() === d.toDateString();
  if (yesterday) return `Yesterday, ${time}`;
  const sameYear = new Date(now).getFullYear() === d.getFullYear();
  return (
    d.toLocaleDateString(
      [],
      sameYear
        ? { month: "short", day: "numeric" }
        : { year: "numeric", month: "short", day: "numeric" },
    ) + `, ${time}`
  );
}

export function formatShortDate(ms, now = Date.now()) {
  if (!ms) return "";
  const d = new Date(ms);
  if (new Date(now).toDateString() === d.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// 3725000 -> "1:02:05"   65000 -> "1:05"
export function formatDuration(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (x) => String(x).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Value for <input type="datetime-local"> in local time.
export function toLocalInputValue(ms) {
  const d = new Date(ms);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}
