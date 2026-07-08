// Open-Meteo geocoding — called directly (CORS *). Returns [] on any failure.
export async function searchPlaces(query) {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=fr&format=json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return (data.results || []).map((r) => {
      const parts = [r.name, r.admin2 || r.admin1].filter(Boolean);
      // append the country for non-French results, so a foreign same-named place
      // (e.g. Brest, Belarus) can't be misclicked
      if (r.country && r.country_code && r.country_code !== "FR") parts.push(r.country);
      return { name: r.name, label: parts.join(", "), lat: r.latitude, lon: r.longitude };
    });
  } catch {
    return [];
  }
}
