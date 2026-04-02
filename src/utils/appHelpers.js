export const initials = (name, fallback = "?") =>
  name ? name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : fallback;

export const relativeTime = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
};

export const matchesRegion = (locationStr, regionFilter, myLocation) => {
  if (!regionFilter) return true;
  const loc = (locationStr || "").toLowerCase();
  const myLoc = (myLocation || "").toLowerCase();
  const myCity = myLoc.split(",")[0].trim();
  if (regionFilter === "local" || regionFilter === "city") return myCity.length > 0 && loc.includes(myCity);
  if (regionFilter === "national") return loc.includes("us") || loc.includes("usa") || loc.includes("united states") || (myLoc && loc.split(",").pop().trim() === myLoc.split(",").pop().trim());
  if (regionFilter === "international") return myLoc.length > 0 && !loc.includes(myLoc.split(",").pop().trim().toLowerCase());
  return true;
};
