const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function encodeGeohash(lat, lng, precision = 6) {
  let idx = 0, bit = 0, evenBit = true, hash = '';
  let minLat = -90, maxLat = 90, minLng = -180, maxLng = 180;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) { idx = idx * 2 + 1; minLng = mid; }
      else            { idx = idx * 2;     maxLng = mid; }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; minLat = mid; }
      else            { idx = idx * 2;     maxLat = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { hash += BASE32[idx]; bit = 0; idx = 0; }
  }
  return hash;
}

// Geocode a free-text location string → { lat, lng, geohash, display }
// Uses Nominatim (OpenStreetMap) — no API key, free, global coverage
export async function geocodeLocation(locationString) {
  if (!locationString?.trim()) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationString.trim())}&format=json&limit=1&addressdetails=0`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CoLab/1.0 (collaborativelaboratories.com)' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data[0]) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    return { lat, lng, geohash: encodeGeohash(lat, lng, 7), display: data[0].display_name };
  } catch {
    return null;
  }
}

// Geohash precision → approx radius
// 4 chars ≈ 40×20 km  (metro area)
// 5 chars ≈ 5×5 km    (city/district)
// 6 chars ≈ 1.2×0.6 km (neighbourhood)
export function geohashDistance(a, b) {
  if (!a || !b) return Infinity;
  let shared = 0;
  const len = Math.min(a.length, b.length);
  while (shared < len && a[shared] === b[shared]) shared++;
  return shared; // higher = closer
}
