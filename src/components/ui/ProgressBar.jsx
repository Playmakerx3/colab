function ProgressBar({ value, dark }) {
  return (
    <div style={{ background: dark ? "#1a1a1a" : "#e8e8e8", borderRadius: 4, height: 3, width: "100%", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(value || 0, 100)}%`, height: "100%", background: dark ? "#fff" : "#000", borderRadius: 4, transition: "width 0.4s ease" }} />
    </div>
  );
}

export default ProgressBar;
