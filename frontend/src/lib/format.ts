/** Short relative time, for the device line on the dashboard. */
export function relative(iso: string | null): string {
  if (!iso) return "never";

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds} s ago`;

  return `${Math.round(seconds / 60)} min ago`;
}
