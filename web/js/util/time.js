// Whole minutes between an epoch-SECONDS timestamp and now. Never negative.
export function minutesAgo(tsSeconds, nowMs = Date.now()) {
  return Math.max(0, Math.round((nowMs - tsSeconds * 1000) / 60000));
}
