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
      const h = Math.round(ROWS / 2 + Math.sin(c / 4) * 3);
      for (let r = h; r < ROWS; r++) p[r * COLS + c] = 1;
    }
    return p;
  })(),
  checkerboard: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if ((r + c) % 2 === 0) p[r * COLS + c] = 1;
    return p;
  })(),
  diagonal: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if ((c - r * 2 + 96) % 8 < 4) p[r * COLS + c] = 1;
    return p;
  })(),
  mountains: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    const heights = Array.from({ length: COLS }, (_, c) => {
      const m1 = Math.max(0, ROWS - Math.abs(c - 12) * 0.7);
      const m2 = Math.max(0, ROWS - Math.abs(c - 32) * 0.5);
      const m3 = Math.max(0, ROWS * 0.6 - Math.abs(c - 22) * 0.9);
      return Math.min(ROWS, Math.round(Math.max(m1, m2, m3)));
    });
    for (let c = 0; c < COLS; c++) for (let r = ROWS - heights[c]; r < ROWS; r++) p[r * COLS + c] = 1;
    return p;
  })(),
  city: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    const buildings = [
      { x: 2, w: 5, h: 8 }, { x: 8, w: 4, h: 6 }, { x: 13, w: 6, h: 10 },
      { x: 20, w: 3, h: 7 }, { x: 24, w: 7, h: 9 }, { x: 32, w: 4, h: 6 },
      { x: 37, w: 5, h: 11 }, { x: 43, w: 5, h: 7 }, { x: 50, w: 5, h: 9 },
      { x: 56, w: 6, h: 12 },
    ];
    buildings.forEach(({ x, w, h }) => {
      for (let c = x; c < x + w && c < COLS; c++) {
        for (let r = ROWS - h; r < ROWS; r++) p[r * COLS + c] = 1;
      }
    });
    return p;
  })(),
  dots: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    for (let r = 1; r < ROWS; r += 3) for (let c = 1; c < COLS; c += 3) p[r * COLS + c] = 1;
    return p;
  })(),
  grid: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (r % 3 === 0 || c % 4 === 0) p[r * COLS + c] = 1;
    return p;
  })(),
};
