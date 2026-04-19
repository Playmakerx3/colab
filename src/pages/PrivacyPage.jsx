export default function PrivacyPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "'DM Mono', monospace", padding: "28px 20px", overflowY: "auto" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ fontSize: 30, fontWeight: 400, marginBottom: 8 }}>Privacy Policy</h1>
        <div style={{ fontSize: 12, color: "#999", marginBottom: 20 }}>Last updated: April 19, 2026</div>
        {[
          ["What we collect", "We collect account email, profile information, and service usage activity."],
          ["How we use it", "Data is used to operate collaboration features, messaging, and account security."],
          ["Supabase / third parties", "CoLab uses Supabase and related providers for storage, auth, and infrastructure."],
          ["Your rights", "You can request access, correction, export, or deletion of your personal information."],
          ["Contact", "For privacy requests, contact privacy@colab.example."],
        ].map(([title, body]) => (
          <section key={title} style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>{title}</h2>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: "#cfcfcf" }}>{body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
