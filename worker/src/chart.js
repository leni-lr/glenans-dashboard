// Met Office surface-pressure chart helpers. The chart page embeds the current
// run timestamp in image URLs like
//   .../surface-pressure/colour/2026-07-05T1200/FSXX12T_00.gif
// so we read the run straight out of the HTML rather than guessing it by clock.

export const CHART_STEPS = [0, 12, 24, 36, 48, 60, 72, 96, 120];

export function parseLatestRun(html) {
  const m = html.match(/surface-pressure\/colour\/(\d{4}-\d{2}-\d{2}T\d{4})\//);
  if (!m) throw new Error("chart run not found");
  return m[1];
}

export function chartGifURL(run, step) {
  const hh = String(step).padStart(2, "0");
  return `https://data.consumer-digital.api.metoffice.gov.uk/v1/surface-pressure/colour/${run}/FSXX12T_${hh}.gif`;
}

// The page can advertise a run (e.g. the 00Z) whose GIFs are not published yet.
// Runs are 12 h apart (00Z / 12Z), so step back to the previous run when needed.
export function previousRun(run) {
  const iso = `${run.slice(0, 4)}-${run.slice(5, 7)}-${run.slice(8, 10)}T${run.slice(11, 13)}:${run.slice(13, 15)}:00Z`;
  const d = new Date(new Date(iso).getTime() - 12 * 3600000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}
