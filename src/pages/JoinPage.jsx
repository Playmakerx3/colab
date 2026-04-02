import React from "react";
import { supabase } from "../supabase";

export default function JoinPage({ token }) {
  const [status, setStatus] = React.useState("loading");
  const [projectTitle, setProjectTitle] = React.useState("");
  const [projectId, setProjectId] = React.useState(null);

  React.useEffect(() => {
    (async () => {
      const { data: invite } = await supabase.from("project_invites").select("*, projects(title)").eq("token", token).single();
      if (!invite) { setStatus("invalid"); return; }
      setProjectTitle(invite.projects?.title || "");
      setProjectId(invite.project_id);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setStatus("login"); return; }
      const { data: existing } = await supabase.from("applications").select("id, status").eq("project_id", invite.project_id).eq("applicant_id", session.user.id).single();
      if (existing?.status === "accepted") { window.location.href = "/"; return; }
      setStatus("join");
    })();
  }, [token]);

  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const bg = dark ? "#0a0a0a" : "#fafafa";
  const text = dark ? "#f0f0f0" : "#111";
  const textMuted = dark ? "#555" : "#aaa";

  const handleAcceptInvite = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !projectId) return;
    const { data: profile } = await supabase.from("profiles").select("name, role").eq("id", session.user.id).single();
    await supabase.from("applications").upsert({
      project_id: projectId,
      applicant_id: session.user.id,
      applicant_name: profile?.name || "",
      applicant_role: profile?.role || "",
      status: "accepted",
    }, { onConflict: "project_id,applicant_id" });
    window.location.href = "/";
  };

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace", color: text }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&display=swap'); *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ textAlign: "center", padding: 32, maxWidth: 400 }}>
        <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 24 }}>[CoLab]</div>
        {status === "loading" && <div style={{ fontSize: 13, color: textMuted }}>loading...</div>}
        {status === "invalid" && (
          <>
            <div style={{ fontSize: 14, marginBottom: 16 }}>invite link not found or expired.</div>
            <a href="/" style={{ fontSize: 12, color: text, textDecoration: "underline" }}>← back to CoLab</a>
          </>
        )}
        {status === "login" && (
          <>
            <div style={{ fontSize: 14, marginBottom: 8 }}>you've been invited to join</div>
            <div style={{ fontSize: 18, fontWeight: 400, marginBottom: 24 }}>{projectTitle}</div>
            <div style={{ fontSize: 12, color: textMuted, marginBottom: 24 }}>sign in to accept the invite.</div>
            <a href="/" style={{ display: "inline-block", padding: "10px 24px", background: text, color: bg, borderRadius: 8, fontSize: 13, textDecoration: "none" }}>sign in →</a>
          </>
        )}
        {status === "join" && (
          <>
            <div style={{ fontSize: 14, marginBottom: 8 }}>you've been invited to join</div>
            <div style={{ fontSize: 18, fontWeight: 400, marginBottom: 24 }}>{projectTitle}</div>
            <button onClick={handleAcceptInvite}
              style={{ display: "inline-block", padding: "10px 24px", background: text, color: bg, borderRadius: 8, fontSize: 13, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              accept invite →
            </button>
            <div style={{ marginTop: 16 }}>
              <a href="/" style={{ fontSize: 11, color: textMuted, textDecoration: "none" }}>← back to CoLab</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
