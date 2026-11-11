/** "02:10" for 130000 ms; "1:02:10" past an hour. Negative values clamp to 0. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "48 seconds", "2 minutes", "1 minute 5 seconds". */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total} ${total === 1 ? 'second' : 'seconds'}`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  const mins = `${m} ${m === 1 ? 'minute' : 'minutes'}`;
  return s ? `${mins} ${s} ${s === 1 ? 'second' : 'seconds'}` : mins;
}

export function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
