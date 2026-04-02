function Spinner({ dark }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{ width: 20, height: 20, border: `2px solid ${dark ? "#333" : "#ddd"}`, borderTop: `2px solid ${dark ? "#fff" : "#000"}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );
}

export default Spinner;
