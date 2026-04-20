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

// Region graph: each key maps to the set of region tags it belongs to (specific → broad)
const REGION_GRAPH = {
  // Bay Area / NorCal
  'oakland':        ['oakland','east bay','bay area','norcal','california','west coast','us'],
  'east bay':       ['east bay','bay area','norcal','california','west coast','us'],
  'san francisco':  ['san francisco','sf','bay area','norcal','california','west coast','us'],
  'sf':             ['sf','san francisco','bay area','norcal','california','west coast','us'],
  'berkeley':       ['berkeley','east bay','bay area','norcal','california','west coast','us'],
  'san jose':       ['san jose','bay area','silicon valley','norcal','california','west coast','us'],
  'silicon valley': ['silicon valley','bay area','norcal','california','west coast','us'],
  'palo alto':      ['palo alto','silicon valley','bay area','norcal','california','west coast','us'],
  'bay area':       ['bay area','norcal','california','west coast','us'],
  'norcal':         ['norcal','nor cal','california','west coast','us'],
  'nor cal':        ['norcal','nor cal','california','west coast','us'],
  'northern california': ['norcal','california','west coast','us'],
  // SoCal
  'los angeles':    ['los angeles','la','socal','california','west coast','us'],
  'la':             ['la','los angeles','socal','california','west coast','us'],
  'san diego':      ['san diego','socal','california','west coast','us'],
  'long beach':     ['long beach','la','socal','california','west coast','us'],
  'socal':          ['socal','so cal','california','west coast','us'],
  'so cal':         ['socal','so cal','california','west coast','us'],
  'southern california': ['socal','california','west coast','us'],
  // California general
  'california':     ['california','ca','west coast','us'],
  'ca':             ['california','ca','west coast','us'],
  // Pacific Northwest / West Coast
  'seattle':        ['seattle','pacific northwest','washington','west coast','us'],
  'portland':       ['portland','pacific northwest','oregon','west coast','us'],
  'pacific northwest': ['pacific northwest','west coast','us'],
  'west coast':     ['west coast','us'],
  // Florida
  'miami':          ['miami','south florida','florida','southeast','us'],
  'south florida':  ['south florida','florida','southeast','us'],
  'fort lauderdale':['fort lauderdale','south florida','florida','southeast','us'],
  'boca raton':     ['boca raton','south florida','florida','southeast','us'],
  'orlando':        ['orlando','florida','southeast','us'],
  'tampa':          ['tampa','florida','southeast','us'],
  'jacksonville':   ['jacksonville','florida','southeast','us'],
  'florida':        ['florida','southeast','us'],
  // DC / DMV / Northeast
  'dc':             ['dc','washington dc','dmv','northeast','us'],
  'washington dc':  ['dc','washington dc','dmv','northeast','us'],
  'dmv':            ['dmv','northeast','us'],
  'new york':       ['new york','nyc','northeast','us'],
  'nyc':            ['nyc','new york','northeast','us'],
  'brooklyn':       ['brooklyn','nyc','new york','northeast','us'],
  'boston':         ['boston','northeast','us'],
  'philadelphia':   ['philadelphia','philly','northeast','us'],
  'philly':         ['philadelphia','philly','northeast','us'],
  'northeast':      ['northeast','north east','us'],
  'north east':     ['northeast','north east','us'],
  // Southwest
  'phoenix':        ['phoenix','arizona','az','southwest','us'],
  'las vegas':      ['las vegas','nevada','nv','southwest','us'],
  'denver':         ['denver','colorado','co','southwest','us'],
  'albuquerque':    ['albuquerque','new mexico','southwest','us'],
  'southwest':      ['southwest','us'],
  // Texas / South
  'austin':         ['austin','texas','tx','south','us'],
  'dallas':         ['dallas','texas','tx','south','us'],
  'houston':        ['houston','texas','tx','south','us'],
  'san antonio':    ['san antonio','texas','tx','south','us'],
  'texas':          ['texas','tx','south','us'],
  'tx':             ['texas','tx','south','us'],
  // Southeast
  'atlanta':        ['atlanta','georgia','southeast','us'],
  'nashville':      ['nashville','tennessee','southeast','us'],
  'charlotte':      ['charlotte','north carolina','southeast','us'],
  'southeast':      ['southeast','us'],
  // Midwest
  'chicago':        ['chicago','illinois','midwest','us'],
  'detroit':        ['detroit','michigan','midwest','us'],
  'minneapolis':    ['minneapolis','minnesota','midwest','us'],
  'midwest':        ['midwest','us'],
  // US general
  'us':             ['us','usa','united states'],
  'usa':            ['us','usa','united states'],
  'united states':  ['us','usa','united states'],
};

const BROAD_TAGS = new Set(['us','usa','united states','west coast','east coast','northeast','north east','northwest','southeast','southwest','midwest','south']);

function getRegionTags(location) {
  if (!location) return new Set();
  const norm = location.toLowerCase().trim();
  const tags = new Set([norm]);
  for (const [key, regions] of Object.entries(REGION_GRAPH)) {
    if (norm.includes(key) || key.includes(norm)) {
      regions.forEach(r => tags.add(r));
    }
  }
  return tags;
}

export const matchesRegion = (locationStr, regionFilter, myLocation) => {
  if (!regionFilter) return true;
  const theirTags = getRegionTags(locationStr);
  const myTags    = getRegionTags(myLocation);

  if (regionFilter === 'national') return theirTags.has('us');
  if (regionFilter === 'international') return !theirTags.has('us');

  // local / city — find shared non-broad tags
  const myLocal    = new Set([...myTags].filter(t => !BROAD_TAGS.has(t)));
  const theirLocal = new Set([...theirTags].filter(t => !BROAD_TAGS.has(t)));
  for (const tag of myLocal) { if (theirLocal.has(tag)) return true; }
  return false;
};
