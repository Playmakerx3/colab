import { COLS, ROWS } from "../../constants/appConstants";

function PixelBannerDisplay({ pixels, dark, height = 80 }) {
  if (!pixels || pixels.every(v => v === 0)) return null;
  const onColor = dark ? "#ffffff" : "#000000";
  return (
    <div style={{ width: "100%", height, position: "relative", overflow: "hidden" }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${COLS} ${ROWS}`} preserveAspectRatio="none" style={{ display: "block" }}>
        {pixels.map((v, i) => v ? (
          <rect key={i} x={i % COLS} y={Math.floor(i / COLS)} width={1} height={1} fill={onColor} opacity={0.9} />
        ) : null)}
      </svg>
    </div>
  );
}

export default PixelBannerDisplay;
