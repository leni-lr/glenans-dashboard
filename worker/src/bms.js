// Météo-France marine bulletin (rwg API). The page zone (BMSCOTE-01-04) maps to
// the API domain (BMRCOTE-01-04, "bulletin marine rivage/côte"). The gale-warning
// status lives INLINE in <bulletinSpecial>; "Pas d'avis…" means no warning.
//
// Auth: the rwg Bearer token is ROT13 of the `mfsession` cookie that
// meteofrance.com sets (Max-Age 3600). It rotates hourly, so the Worker mints a
// fresh one per request rather than hardcoding it. The token never reaches the
// frontend. env.MF_TOKEN overrides the mint (handy for local testing).
export const MF_HOME = "https://meteofrance.com/";

// ROT13 over ASCII letters only (digits/punctuation of the JWT are untouched).
export function rot13(s) {
  return String(s).replace(/[a-zA-Z]/g, (e) => {
    const base = e <= "Z" ? 65 : 97;
    return String.fromCharCode(base + (e.charCodeAt(0) - base + 13) % 26);
  });
}

// Derive the Bearer token from a Set-Cookie header string (mfsession → ROT13).
export function tokenFromSetCookie(setCookie) {
  const m = /(?:^|[,;\s])mfsession=([^;,\s]+)/.exec(setCookie || "");
  return m ? rot13(decodeURIComponent(m[1])) : null;
}

export function bmsDomain(zone) {
  return String(zone).replace(/[^A-Za-z0-9-]/g, "").replace(/^BMS/i, "BMR");
}

export function bmsURL(zone) {
  return `https://rwg.meteofrance.com/internet2018client/2.0/report?domain=${bmsDomain(zone)}&report_type=marine&report_subtype=BMR_cote_fr&format=xml`;
}

function cdata(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
  return m ? m[1].trim() : "";
}

export function parseBMS(xml) {
  const title = cdata(xml, "titreBulletin");
  const situation = cdata(xml, "situation");
  const special = cdata(xml, "bulletinSpecial");
  if (!title && !situation) throw new Error("bms parse: empty");
  const warning = special ? !/pas d'avis/i.test(special) : false;
  return { title, situation, special, warning };
}
