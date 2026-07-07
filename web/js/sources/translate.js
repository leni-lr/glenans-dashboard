// Translate one string via the unofficial, no-key Google endpoint — called
// directly from the browser (it sends Access-Control-Allow-Origin: *), which
// avoids the rate-limiting Google applies to shared Cloudflare Worker IPs.
// Always resolves: returns the original text if the call fails or is malformed,
// so a translation hiccup never blocks a render.
export async function translateText(text, to = "en") {
  if (!text) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) return text;
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data) || !Array.isArray(data[0])) return text;
    return data[0].map((seg) => (seg && seg[0]) ? seg[0] : "").join("") || text;
  } catch {
    return text;
  }
}
