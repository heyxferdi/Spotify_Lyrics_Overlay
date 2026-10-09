// Shows only the current line and a dimmed preview of the next one.
function LyricsDisplay({ progressMs, lyrics }) {
  if (!lyrics) {
    return <p className="next">No synced lyrics for this song</p>
  }

  let idx = -1
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].startTimeMs <= progressMs) idx = i
    else break
  }

  const current = idx >= 0 ? lyrics[idx].words : '♪'
  const next = lyrics[idx + 1]?.words ?? ''

  return (
    <>
      {/* key restarts the fade-in animation whenever the line changes */}
      <p className="current" key={idx}>
        {current}
      </p>
      <p className="next">{next}</p>
    </>
  )
}

export { LyricsDisplay }
