import CoLabApp from "./features/app/components/CoLabApp";
import JoinPage from "./pages/JoinPage";
import PublicProfilePage from "./pages/PublicProfilePage";
import PublicProjectPage from "./pages/PublicProjectPage";
import ShippedPage from "./pages/ShippedPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";

const KNOWN_ROOTS = ["/", "/app", "/explore", "/network", "/workspace", "/communities", "/messages", "/profile"];

export default function App() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const publicMatch = pathname.match(/^\/p\/([^/]+)$/);
  const shippedMatch = pathname.match(/^\/p\/([^/]+)\/shipped$/);
  const profileMatch = pathname.match(/^\/(?:u|profile)\/([^/]+)$/);
  const profileByIdMatch = pathname.match(/^\/profile\/id\/([^/]+)$/);
  const joinMatch = pathname.match(/^\/join\/([^/]+)$/);
  const termsMatch = pathname === "/terms";
  const privacyMatch = pathname === "/privacy";

  if (shippedMatch) return <ShippedPage projectId={shippedMatch[1]} />;
  if (publicMatch) return <PublicProjectPage projectId={publicMatch[1]} />;
  if (profileByIdMatch) return <PublicProfilePage userId={profileByIdMatch[1]} />;
  if (profileMatch) return <PublicProfilePage username={profileMatch[1]} />;
  if (joinMatch) return <JoinPage token={joinMatch[1]} />;
  if (termsMatch) return <TermsPage />;
  if (privacyMatch) return <PrivacyPage />;

  // Unknown route — show 404
  const isKnown = KNOWN_ROOTS.some(r => pathname === r) || pathname === "/";
  if (!isKnown && pathname !== "/") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "#0a0a0a", color: "#fff",
        fontFamily: "'DM Mono', monospace", padding: "24px 16px", textAlign: "center",
      }}>
        <div style={{ fontSize: 64, fontWeight: 400, letterSpacing: "-2px", marginBottom: 8, color: "#333" }}>404</div>
        <div style={{ fontSize: 22, fontWeight: 400, letterSpacing: "-0.5px", marginBottom: 12 }}>page not found.</div>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 36, lineHeight: 1.7 }}>
          This page doesn't exist or was moved.
        </div>
        <a href="/" style={{
          background: "#fff", color: "#0a0a0a", border: "none", borderRadius: 8,
          padding: "12px 28px", fontSize: 13, cursor: "pointer",
          fontFamily: "'DM Mono', monospace", textDecoration: "none", display: "inline-block",
        }}>
          go home →
        </a>
      </div>
    );
  }

  return <CoLabApp />;
}
