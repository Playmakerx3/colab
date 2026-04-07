function Avatar({ initials: i, size = 32, dark }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: dark ? "#fff" : "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.32, fontWeight: 700, color: dark ? "#000" : "#fff", flexShrink: 0, fontFamily: "inherit" }}>
      {(i || "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

export default Avatar;
