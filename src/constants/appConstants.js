export const SKILLS = [
  "Design", "Engineering", "Marketing", "Finance", "Legal", "Writing", "Video", "Music",
  "Photography", "Data", "AI/ML", "Product", "Sales", "Operations", "3D/CAD", "Architecture",
];

export const CATEGORIES = [
  "Tech / Software", "Creative / Art", "Music", "Film / Video", "Physical / Hardware",
  "Business / Startup", "Social Impact", "Research", "Other",
];

export const AVAILABILITY = ["Full-time", "Part-time", "Weekends only", "Evenings only", "Flexible"];

export const PLUGINS = [
  { id: "slack", name: "Slack", icon: "#", desc: "Team messaging" },
  { id: "discord", name: "Discord", icon: "◈", desc: "Voice & chat" },
  { id: "drive", name: "Google Drive", icon: "△", desc: "File sharing" },
  { id: "notion", name: "Notion", icon: "□", desc: "Docs & tasks" },
  { id: "github", name: "GitHub", icon: "◎", desc: "Code & repos" },
  { id: "figma", name: "Figma", icon: "◐", desc: "Design files" },
];

export const COLS = 64;
export const ROWS = 16;
export const BANNER_PIXELS_COUNT = COLS * ROWS;

export const normalizeBannerPixels = (pixels) => {
  if (!Array.isArray(pixels)) return new Array(BANNER_PIXELS_COUNT).fill(0);
  const normalized = new Array(BANNER_PIXELS_COUNT).fill(0);
  const max = Math.min(pixels.length, BANNER_PIXELS_COUNT);
  for (let i = 0; i < max; i += 1) normalized[i] = pixels[i] ? 1 : 0;
  return normalized;
};

export const PRESETS = {
  empty: new Array(BANNER_PIXELS_COUNT).fill(0),

  wave: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    for (let c = 0; c < COLS; c++) {
      const h = Math.round(ROWS * 0.45 + Math.sin((c / COLS) * Math.PI * 4) * 5);
      for (let r = Math.max(0, h); r < ROWS; r++) p[r * COLS + c] = 1;
    }
    return p;
  })(),


  // Full skyline, edge-to-edge, buildings with punched windows
  city: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    const build = (x, w, h, win = false) => {
      for (let c = x; c < Math.min(x + w, COLS); c++)
        for (let r = ROWS - h; r < ROWS; r++) p[r * COLS + c] = 1;
      if (win && w >= 3 && h >= 5) {
        for (let c = x + 1; c < Math.min(x + w - 1, COLS); c += 2)
          for (let r = ROWS - h + 1; r < ROWS - 1; r += 2) p[r * COLS + c] = 0;
      }
    };
    build(0,  4, 7,  true);   // cols 0–3
    build(4,  2, 4);           // cols 4–5
    build(6,  1, 13);          // antenna
    build(7,  5, 9,  true);   // cols 7–11
    build(12, 4, 6,  true);   // cols 12–15
    build(16, 1, 14);          // spire
    build(17, 6, 15, true);   // cols 17–22  tall
    build(23, 4, 8,  true);   // cols 23–26
    build(27, 1, 11);          // thin
    build(28, 6, 14, true);   // cols 28–33  tall
    build(34, 4, 10, true);   // cols 34–37
    build(38, 1, 15);          // spire
    build(39, 7, 16, true);   // cols 39–45  tallest
    build(46, 4, 9,  true);   // cols 46–49
    build(50, 3, 6);           // cols 50–52
    build(53, 5, 11, true);   // cols 53–57
    build(58, 1, 12);          // antenna
    build(59, 5, 8,  true);   // cols 59–63
    return p;
  })(),

  pulse: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    const bars = [5, 9, 12, 8, 14, 11, 6, 13, 10, 15, 12, 7, 11, 9, 14, 16,
                  13, 10, 7, 12, 15, 11, 8, 13, 6, 10, 14, 9, 12, 7, 11, 5];
    bars.forEach((h, i) => {
      const c = i * 2;
      for (let r = ROWS - h; r < ROWS; r++) p[r * COLS + c] = 1;
    });
    return p;
  })(),

  // 4 classic space invader sprites
  invaders: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    const sprite = [
      [0,0,1,0,0,0,0,0,1,0,0],
      [0,0,0,1,0,0,0,1,0,0,0],
      [0,0,1,1,1,1,1,1,1,0,0],
      [0,1,1,0,1,1,1,0,1,1,0],
      [1,1,1,1,1,1,1,1,1,1,1],
      [1,0,1,1,1,1,1,1,1,0,1],
      [1,0,1,0,0,0,0,0,1,0,1],
      [0,0,0,1,1,0,1,1,0,0,0],
    ];
    [2, 18, 34, 50].forEach(ox => {
      sprite.forEach((row, dr) => row.forEach((v, dc) => {
        if (v) p[(4 + dr) * COLS + (ox + dc)] = 1;
      }));
    });
    return p;
  })(),

  diagonal: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
      if (((Math.floor(c / 2) + Math.floor(r / 2)) % 2) === 0) p[r * COLS + c] = 1;
    return p;
  })(),

  // Sun rising above a flat horizon
  horizon: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    // Ground: bottom 4 rows
    for (let r = 12; r < ROWS; r++) for (let c = 0; c < COLS; c++) p[r * COLS + c] = 1;
    // Large sun arc above horizon (ellipse centered at horizon line)
    const cx = 32, cy = 12, rx = 22, ry = 8;
    for (let r = 0; r < 12; r++) {
      const dy = (r - cy) / ry;
      const dxMax = Math.sqrt(Math.max(0, 1 - dy * dy));
      const cMin = Math.round(cx - rx * dxMax);
      const cMax = Math.round(cx + rx * dxMax);
      for (let c = Math.max(0, cMin); c <= Math.min(COLS - 1, cMax); c++) p[r * COLS + c] = 1;
    }
    return p;
  })(),
};
