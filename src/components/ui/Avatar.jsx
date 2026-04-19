function Avatar({ initials: i, src, size = 32, dark }) {
  if (src) {
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: dark ? "#fff" : "#000" }}>
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: dark ? "#fff" : "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.32, fontWeight: 700, color: dark ? "#000" : "#fff", flexShrink: 0, fontFamily: "inherit" }}>
      {(i || "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

export default Avatar;
