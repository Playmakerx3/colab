export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "'DM Mono', monospace", padding: "28px 20px", overflowY: "auto" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ fontSize: 30, fontWeight: 400, marginBottom: 8 }}>Terms of Service</h1>
        <div style={{ fontSize: 12, color: "#999", marginBottom: 20 }}>Last updated: April 19, 2026</div>
        {[
          ["Acceptance of Terms", "By using CoLab, you agree to these Terms and any related policies."],
          ["Use of Service", "You may use CoLab only for lawful collaboration and project activity."],
          ["User Content", "You retain ownership of your content and grant CoLab rights to host and display it."],
          ["Privacy", "Use of CoLab is also governed by the Privacy Policy."],
          ["Termination", "Accounts may be suspended or terminated for violations or abusive behavior."],
          ["Contact", "For legal inquiries, contact support@colab.example."],
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
