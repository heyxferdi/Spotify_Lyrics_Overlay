import { useEffect, useState } from "react";

import TitleDisplay from "./components/TitleDisplay";
import { LyricsDisplay } from "./components/LyricsDisplay";

// Now-playing info comes from Windows (via the Electron main process) and
// lyrics from LRCLIB. No Spotify API or token is used.
function App() {
  const [media, setMedia] = useState(null); // last update + receivedAt
  const [lyrics, setLyrics] = useState(null);
  const [now, setNow] = useState(Date.now());

  const hasBridge = typeof window !== "undefined" && !!window.overlay;

  // Receive media updates from Electron
  useEffect(() => {
    if (!hasBridge) return;
    return window.overlay.onMedia((m) =>
      setMedia(m && m.title ? { ...m, receivedAt: Date.now() } : null)
    );
  }, [hasBridge]);

  // Local clock so lyrics keep moving between updates
  useEffect(() => {
    if (!media?.playing) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [media?.playing]);

  const trackKey = media ? `${media.title}|${media.artist}|${media.album}` : null;

  // Fetch lyrics when the track changes
  useEffect(() => {
    if (!trackKey || !hasBridge) {
      setLyrics(null);
      return;
    }
    let cancelled = false;
    setLyrics(null);
    window.overlay
      .getLyrics({
        title: media.title,
        artist: media.artist,
        album: media.album,
        durationMs: media.durationMs,
      })
      .then((lines) => {
        if (!cancelled) setLyrics(lines && lines.length ? lines : null);
      })
      .catch(() => !cancelled && setLyrics(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey, hasBridge]);

  if (!hasBridge) {
    return (
      <div className="overlay">
        <p className="next">Open the Electron overlay window</p>
      </div>
    );
  }

  // Nothing playing -> show nothing at all
  if (!media) return null;

  const progress =
    media.positionMs + (media.playing ? Math.max(now - media.receivedAt, 0) : 0);
  const pct = media.durationMs ? Math.min(progress / media.durationMs, 1) * 100 : 0;

  return (
    <div className={`overlay${media.playing ? "" : " paused"}`}>
      <TitleDisplay name={media.title} artist={media.artist} />
      <LyricsDisplay progressMs={progress} lyrics={lyrics} />
      <div className="progress" style={{ width: `${pct}%` }} />
    </div>
  );
}
export default App;
