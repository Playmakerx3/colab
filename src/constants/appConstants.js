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
  mountains: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    const peaks = [
      { c: 8,  h: 12, s: 0.70 },
      { c: 24, h: 16, s: 0.55 },
      { c: 42, h: 14, s: 0.65 },
      { c: 56, h: 15, s: 0.60 },
    ];
    const heights = Array.from({ length: COLS }, (_, c) => {
      const h = Math.max(...peaks.map(pk => Math.max(0, pk.h - Math.abs(c - pk.c) * pk.s)));
      return Math.min(ROWS, Math.round(h));
    });
    for (let c = 0; c < COLS; c++) for (let r = ROWS - heights[c]; r < ROWS; r++) p[r * COLS + c] = 1;
    return p;
  })(),
  city: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    const buildings = [
      { x: 0,  w: 4, h: 7  }, { x: 5,  w: 3, h: 10 }, { x: 9,  w: 6, h: 5  },
      { x: 16, w: 4, h: 13 }, { x: 21, w: 5, h: 8  }, { x: 27, w: 3, h: 6  },
      { x: 31, w: 6, h: 15 }, { x: 38, w: 4, h: 9  }, { x: 43, w: 5, h: 12 },
      { x: 49, w: 3, h: 7  }, { x: 53, w: 5, h: 11 }, { x: 59, w: 5, h: 9  },
    ];
    buildings.forEach(({ x, w, h }) => {
      for (let c = x; c < x + w && c < COLS; c++)
        for (let r = ROWS - h; r < ROWS; r++) p[r * COLS + c] = 1;
    });
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
  checkerboard: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
      if ((Math.floor(r / 2) + Math.floor(c / 2)) % 2 === 0) p[r * COLS + c] = 1;
    return p;
  })(),
  diagonal: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
      if (((c - r * 2) % 8 + 8) % 8 < 4) p[r * COLS + c] = 1;
    return p;
  })(),
  dots: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    for (let r = 2; r < ROWS; r += 4) for (let c = 2; c < COLS; c += 4) p[r * COLS + c] = 1;
    return p;
  })(),
  grid: (() => {
    const p = new Array(BANNER_PIXELS_COUNT).fill(0);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
      if (r % 4 === 0 || c % 8 === 0) p[r * COLS + c] = 1;
    return p;
  })(),
};
