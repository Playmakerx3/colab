import CoLabApp from "./features/app/components/CoLabApp";
import JoinPage from "./pages/JoinPage";
import PublicProfilePage from "./pages/PublicProfilePage";
import PublicProjectPage from "./pages/PublicProjectPage";
import ShippedPage from "./pages/ShippedPage";

export default function App() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const publicMatch = pathname.match(/^\/p\/([^/]+)$/);
  const shippedMatch = pathname.match(/^\/p\/([^/]+)\/shipped$/);
  const profileMatch = pathname.match(/^\/(?:u|profile)\/([^/]+)$/);
  const profileByIdMatch = pathname.match(/^\/profile\/id\/([^/]+)$/);
  const joinMatch = pathname.match(/^\/join\/([^/]+)$/);

  if (shippedMatch) return <ShippedPage projectId={shippedMatch[1]} />;
  if (publicMatch) return <PublicProjectPage projectId={publicMatch[1]} />;
  if (profileByIdMatch) return <PublicProfilePage userId={profileByIdMatch[1]} />;
  if (profileMatch) return <PublicProfilePage username={profileMatch[1]} />;
  if (joinMatch) return <JoinPage token={joinMatch[1]} />;
  return <CoLabApp />;
}
