import CoLabApp from "./features/app/components/CoLabApp";
import JoinPage from "./pages/JoinPage";
import PublicProfilePage from "./pages/PublicProfilePage";
import PublicProjectPage from "./pages/PublicProjectPage";
import ShippedPage from "./pages/ShippedPage";

const publicMatch = typeof window !== "undefined" ? window.location.pathname.match(/^\/p\/([^/]+)$/) : null;
const shippedMatch = typeof window !== "undefined" ? window.location.pathname.match(/^\/p\/([^/]+)\/shipped$/) : null;
const profileMatch = typeof window !== "undefined" ? window.location.pathname.match(/^\/u\/([^/]+)$/) : null;
const joinMatch = typeof window !== "undefined" ? window.location.pathname.match(/^\/join\/([^/]+)$/) : null;

export default function App() {
  if (shippedMatch) return <ShippedPage projectId={shippedMatch[1]} />;
  if (publicMatch) return <PublicProjectPage projectId={publicMatch[1]} />;
  if (profileMatch) return <PublicProfilePage username={profileMatch[1]} />;
  if (joinMatch) return <JoinPage token={joinMatch[1]} />;
  return <CoLabApp />;
}
