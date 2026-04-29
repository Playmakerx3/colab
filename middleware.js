const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const OG_IMAGE = "https://www.collaborativelaboratories.com/og-image.png";

export const config = {
  matcher: ["/u/:username", "/p/:id", "/p/:id/shipped"],
};

function esc(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function supabaseFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  return res.json();
}

async function getOg(pathname) {
  const profileMatch = pathname.match(/^\/u\/([^/]+)$/);
  const projectMatch = pathname.match(/^\/p\/([^/]+)/);

  if (profileMatch) {
    const data = await supabaseFetch(
      `profiles?username=eq.${encodeURIComponent(profileMatch[1])}&select=name,bio,role&limit=1`
    );
    const u = data?.[0];
    if (!u) return null;
    return {
      title: `${u.name} — CoLab`,
      description: u.bio
        ? u.bio.slice(0, 155)
        : `${u.name} is building on CoLab. Find collaborators and ship together.`,
    };
  }

  if (projectMatch) {
    const data = await supabaseFetch(
      `projects?id=eq.${encodeURIComponent(projectMatch[1])}&select=title,description&limit=1`
    );
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
    .replace(/(<meta property="og:title"\s+content=")[^"]*(")/,       `$1${t}$2`)
    .replace(/(<meta property="og:description"\s+content=")[^"]*(")/,  `$1${d}$2`)
    .replace(/(<meta property="og:url"\s+content=")[^"]*(")/,          `$1${u}$2`)
    .replace(/(<meta name="twitter:title"\s+content=")[^"]*(")/,       `$1${t}$2`)
    .replace(/(<meta name="twitter:description"\s+content=")[^"]*(")/,  `$1${d}$2`)
    .replace(/(<link rel="canonical"\s+href=")[^"]*(")/,               `$1${u}$2`);
}

export default async function middleware(request) {
  const url = new URL(request.url);

  try {
    const og = await getOg(url.pathname);
    if (!og) return; // fall through to normal routing

    const indexRes = await fetch(`${url.origin}/index.html`);
    const html = await indexRes.text();
    const modified = inject(html, og, url.href);

    return new Response(modified, {
      headers: {
        "content-type": "text/html;charset=UTF-8",
        "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch {
    return; // on any error, fall through — SPA handles it
  }
}
