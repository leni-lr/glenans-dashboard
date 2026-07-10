// Pure label for a chart step: "analyse T+0 · ven 12h" / "T+12 · sam 00h".
// run is the Met Office run stamp "YYYY-MM-DDTHHMM" in UTC; valid = run + step
// hours, shown in the viewer's local time (the Z makes it parse as UTC).
export function chartStepLabel(run, step, lang) {
  const iso = `${run.slice(0, 4)}-${run.slice(5, 7)}-${run.slice(8, 10)}T${run.slice(11, 13)}:${run.slice(13, 15)}:00Z`;
  const valid = new Date(new Date(iso).getTime() + step * 3600000);
  const day = valid.toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { weekday: "short" });
  const hh = String(valid.getHours()).padStart(2, "0");
  return `${step === 0 ? "analyse T+0" : `T+${step}`} · ${day} ${hh}h`;
}
