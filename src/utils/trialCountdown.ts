export function formatTrialCountdown(
  days: number,
  hours: number,
  minutes: number,
  seconds: number,
): string {
  const dd = String(days).padStart(2, '0');
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${dd}:${hh}:${mm}:${ss}`;
}
