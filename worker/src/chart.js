// Met Office surface-pressure chart helpers. The chart page embeds the current
// run timestamp in image URLs like
//   .../surface-pressure/colour/2026-07-05T1200/FSXX12T_00.gif
// so we read the run straight out of the HTML rather than guessing it by clock.
// Two variants: "colour" (steps to T+120) and "bw" (a different filename scheme,
// steps to T+84). The run timestamp is shared between them.

// Candidate steps per variant. The Met Office publishes the longer ranges with a
// lag (and on different run cycles), so the actual step list is probed per run at
// request time — both variants share one run (the freshest with an analysis) and
// advertise only the steps really published for it, keeping their valid times aligned.
export const CHART_STEPS_COLOUR = [0, 12, 24, 36, 48, 60, 72, 96, 120];
export const CHART_STEPS_BW = [0, 12, 24, 36, 48, 60, 72, 84];
export const CHART_STEPS = CHART_STEPS_BW;

export function chartSteps(variant) {
  return variant === "bw" ? CHART_STEPS_BW : CHART_STEPS_COLOUR;
}

export function parseLatestRun(html) {
  const m = html.match(/surface-pressure\/colour\/(\d{4}-\d{2}-\d{2}T\d{4})\//);
  if (!m) throw new Error("chart run not found");
  return m[1];
}

// The most recent 00Z/12Z run boundary at or before `now` (UTC). Used instead of
// the page's advertised run, which can lag the image API and leave us stuck on an
// older run (we only ever step backward from the start point).
export function latestRunByClock(now = new Date()) {
  const runHour = now.getUTCHours() >= 12 ? 12 : 0;
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), runHour));
  const p = (n) => String(n).padStart(2, "0");
  return `${base.getUTCFullYear()}-${p(base.getUTCMonth() + 1)}-${p(base.getUTCDate())}T${p(base.getUTCHours())}00`;
}

const BASE = "https://data.consumer-digital.api.metoffice.gov.uk/v1/surface-pressure";

export function chartGifURL(run, step, variant = "colour") {
  if (variant === "bw") {
    // bw scheme: {runHH}00_{TYPE}_FC{step3}.gif; TYPE varies with the range.
    const rh = run.slice(11, 13); // "00" or "12"
    const type = step === 0 ? "ASXX_Assistant" : (step <= 24 ? "FSXX" : "MEDIUM_RANGE");
    return `${BASE}/bw/${run}/${rh}00_${type}_FC${String(step).padStart(3, "0")}.gif`;
  }
  // colour: FSXX{runHH}T_{step2} — run-hour-aware so it works on 00Z runs too.
  const rh = run.slice(11, 13);
  const hh = String(step).padStart(2, "0");
  return `${BASE}/colour/${run}/FSXX${rh}T_${hh}.gif`;
}

// The page can advertise a run (e.g. the 00Z) whose GIFs are not published yet.
// Runs are 12 h apart (00Z / 12Z), so step back to the previous run when needed.
export function previousRun(run) {
  const iso = `${run.slice(0, 4)}-${run.slice(5, 7)}-${run.slice(8, 10)}T${run.slice(11, 13)}:${run.slice(13, 15)}:00Z`;
  const d = new Date(new Date(iso).getTime() - 12 * 3600000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}
