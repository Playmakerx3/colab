export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const OG_IMAGE = "https://www.collaborativelaboratories.com/og-image.png";

function esc(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function getOg(type, slug) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };

  if (type === "profile") {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(slug)}&select=name,bio,role&limit=1`,
      { headers }
    );
    const data = await res.json();
    const u = data?.[0];
    if (!u) return null;
    return {
      title: `${u.name} — CoLab`,
      description: u.bio
        ? u.bio.slice(0, 155)
        : `${u.name} is building on CoLab. Find collaborators and ship together.`,
    };
  }

  if (type === "project") {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/projects?id=eq.${encodeURIComponent(slug)}&select=title,description&limit=1`,
      { headers }
    );
    const data = await res.json();
    const p = data?.[0];
    if (!p) return null;
    return {
      title: `${p.title} — CoLab`,
      description: p.description
        ? p.description.slice(0, 155)
        : "A project looking for collaborators on CoLab.",
    };
  }

  return null;
}

function inject(html, og, pageUrl) {
  const t = esc(og.title);
  const d = esc(og.description);
  const u = esc(pageUrl);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta property="og:title"\s+content=")[^"]*(")/,        `$1${t}$2`)
    .replace(/(<meta property="og:description"\s+content=")[^"]*(")/,  `$1${d}$2`)
    .replace(/(<meta property="og:url"\s+content=")[^"]*(")/,          `$1${u}$2`)
    .replace(/(<meta name="twitter:title"\s+content=")[^"]*(")/,       `$1${t}$2`)
    .replace(/(<meta name="twitter:description"\s+content=")[^"]*(")/,  `$1${d}$2`)
    .replace(/(<link rel="canonical"\s+href=")[^"]*(")/,               `$1${u}$2`);
}

export default async function handler(request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const slug = url.searchParams.get("slug");

  try {
    const og = await getOg(type, slug);
    if (!og) {
      // Fall through: serve plain index.html
      const res = await fetch(`https://www.collaborativelaboratories.com/index.html`);
      const html = await res.text();
      return new Response(html, {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    const res = await fetch(`https://www.collaborativelaboratories.com/index.html`);
    const html = await res.text();
    const modified = inject(html, og, url.searchParams.get("url") || "");

    return new Response(modified, {
      headers: {
        "content-type": "text/html;charset=UTF-8",
        "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    const res = await fetch(`https://www.collaborativelaboratories.com/index.html`);
    const html = await res.text();
    return new Response(html, {
      headers: { "content-type": "text/html;charset=UTF-8" },
    });
  }
}
