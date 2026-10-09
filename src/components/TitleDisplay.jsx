function TitleDisplay({ name, artist }) {
  return (
    <div className="meta">
      <span className="title">{name}</span>
      {artist ? <span> · {artist}</span> : null}
    </div>
  )
}

export default TitleDisplay
