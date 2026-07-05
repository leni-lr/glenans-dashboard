// Parser for maree.info tide pages (e.g. https://maree.info/94).
// ALL selectors/regex for the scrape live here so the site's HTML changing
// is a one-function fix.
//
// The page is server-rendered and carries the day-by-day tide table as a
// plain HTML table (id="MareeJours"): one row per day, each row holding a
// "Heure" <td>, a "Hauteur" <td> and a "Coeff." <td>, each <br>-separated
// per tide event. High-water (PM = "Pleine Mer") entries are wrapped in
// <b>...</b>; low-water (BM = "Basse Mer") entries are plain text. The
// coefficient is only printed next to high-water entries. The page's date
// context (today + the following 6 days) is read out of the embedded
// `var Marees = {...}` object (Marees.aujourdhui / Marees.Dates), which is
// far more robust than trying to reconstruct dates from the href query
// strings.

function decodeEntities(str) {
  return str
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/&ecirc;/g, "ê")
    .replace(/&agrave;/g, "à")
    .replace(/&ccedil;/g, "ç")
    .replace(/&ocirc;/g, "ô")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function ymdToIsoDate(ymd) {
  const s = String(ymd);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// "4,27m" / "1,33m" -> 4.27 / 1.33
function parseHeight(str) {
  const m = str.match(/(-?\d+),(\d+)\s*m/);
  return m ? Number(`${m[1]}.${m[2]}`) : null;
}

// "08h46" -> "08:46"
function parseTime(str) {
  const m = str.match(/(\d{2})h(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
}

export function parseTide(html) {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (!titleMatch) throw new Error("tide data not found: no <title>");
  const title = decodeEntities(titleMatch[1]);
  const portMatch = title.match(/Mar[ée]es\s+(.+?)\s*\/\s*France/i);
  if (!portMatch) throw new Error("tide data not found: port name not in <title>");
  const port = portMatch[1].trim();

  const datesMatch = html.match(/'Dates'\s*:\s*\[([^\]]+)\]/);
  const todayMatch = html.match(/'aujourdhui'\s*:\s*(\d+)/);
  if (!datesMatch || !todayMatch) {
    throw new Error("tide data not found: Marees.Dates/aujourdhui missing");
  }
  const dates = datesMatch[1].split(",").map((s) => s.trim());
  const today = ymdToIsoDate(todayMatch[1]);

  const rowRe =
    /<tr class="MJ[^"]*" id="MareeJours_(\d+)"[^>]*>.*?<td>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/gs;
  const rows = [...html.matchAll(rowRe)];
  if (rows.length === 0) throw new Error("tide data not found: MareeJours table missing");

  const extremes = [];
  let coef = [];

  for (const row of rows) {
    const idx = Number(row[1]);
    const ymd = dates[idx];
    if (!ymd) continue;
    const dateIso = ymdToIsoDate(ymd);

    const timeSegs = row[2].split("<br>");
    const heightSegs = row[3].split("<br>");
    const coefSegs = row[4].split("<br>");

    const rowCoefs = [];
    for (let i = 0; i < timeSegs.length; i++) {
      const isHigh = /^<b>/.test(timeSegs[i]);
      const time = parseTime(timeSegs[i]);
      const h = parseHeight(heightSegs[i] || "");
      if (!time || h === null) continue;
      extremes.push({
        type: isHigh ? "high" : "low",
        time,
        iso: `${dateIso}T${time}`,
        h,
      });
      if (isHigh) {
        const cm = (coefSegs[i] || "").match(/(\d+)/);
        if (cm) rowCoefs.push(Number(cm[1]));
      }
    }
    if (idx === 0) coef = rowCoefs;
  }

  if (extremes.length === 0) throw new Error("tide data not found: no extremes parsed");

  return { port, today, coef, extremes };
}
