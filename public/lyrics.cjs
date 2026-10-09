// Fetches synced lyrics from LRCLIB (https://lrclib.net) - free, no API key.

function parseLrc(lrc) {
  const lines = [];
  for (const raw of String(lrc).split(/\r?\n/)) {
    const m = raw.match(/^\s*((?:\[\d+:\d+(?:\.\d+)?\]\s*)+)(.*)$/);
    if (!m) continue;
    const words = m[2].trim() || "♪";
    for (const t of m[1].matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)) {
      lines.push({
        startTimeMs: Math.round((Number(t[1]) * 60 + Number(t[2])) * 1000),
        words,
      });
    }
  }
  return lines.sort((a, b) => a.startTimeMs - b.startTimeMs);
}

const BASE = "https://lrclib.net/api";
const HEADERS = { "User-Agent": "SpotifyLyricsOverlay (personal desktop overlay)" };
const cache = new Map();

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  return res.json();
}

async function getLyrics({ title, artist, album, durationMs }) {
  if (!title) return null;
  const key = `${title}|${artist}|${album}`;
  if (cache.has(key)) return cache.get(key);

  const durationSec = durationMs ? Math.round(durationMs / 1000) : null;
  let lines = null;

  try {
    // 1) exact match
    const exact = new URLSearchParams({ track_name: title, artist_name: artist || "" });
    if (album) exact.set("album_name", album);
    if (durationSec) exact.set("duration", String(durationSec));
    let hit = await getJson(`${BASE}/get?${exact}`);

    // 2) fuzzy search fallback (handles "- Remastered", "(feat. X)", etc.)
    if (!hit?.syncedLyrics) {
      const results = await getJson(
        `${BASE}/search?${new URLSearchParams({ track_name: title, artist_name: artist || "" })}`
      );
      const synced = (results || []).filter((r) => r.syncedLyrics);
      if (synced.length) {
        synced.sort(
          (a, b) =>
            Math.abs((a.duration || 0) - (durationSec || 0)) -
            Math.abs((b.duration || 0) - (durationSec || 0))
        );
        hit = synced[0];
      }
    }

    if (hit?.syncedLyrics) lines = parseLrc(hit.syncedLyrics);
    if (lines && lines.length === 0) lines = null;
  } catch (err) {
    console.error("[lyrics] lookup failed:", err.message);
    return null; // don't cache network errors
  }

  cache.set(key, lines);
  return lines;
}

module.exports = { getLyrics, parseLrc };
