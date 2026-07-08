// Open-Meteo geocoding — called directly (CORS *). Returns [] on any failure.
export async function searchPlaces(query) {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=fr&format=json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return (data.results || []).map((r) => ({
      name: r.name,
      label: [r.name, r.admin2 || r.admin1].filter(Boolean).join(", "),
      lat: r.latitude,
      lon: r.longitude,
    }));
  } catch {
    return [];
  }
}
