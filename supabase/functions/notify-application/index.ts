// Supabase Edge Function: notify-application
// Triggered via database webhook on INSERT to `applications` table.
// Sends an email to the project owner when someone applies.
//
// Deploy: supabase functions deploy notify-application
// Set secrets: supabase secrets set RESEND_API_KEY=re_...
//
// Then create the database webhook in Supabase Dashboard:
//   Table: applications  |  Event: INSERT  |  Type: HTTP Request
//   URL: https://<project-ref>.supabase.co/functions/v1/notify-application

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL = "CoLab <noreply@colab.build>";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const payload = await req.json();
  const application = payload.record;
  if (!application) return new Response("no record", { status: 400 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Get the project
  const { data: project } = await supabase
    .from("projects")
    .select("title, owner_id")
    .eq("id", application.project_id)
    .single();

  if (!project) return new Response("project not found", { status: 404 });

  // Get the owner's email
  const { data: ownerAuth } = await supabase.auth.admin.getUserById(project.owner_id);
  const ownerEmail = ownerAuth?.user?.email;
  if (!ownerEmail) return new Response("owner email not found", { status: 404 });

  // Send email via Resend
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: ownerEmail,
      subject: `New application for "${project.title}"`,
      html: `
        <div style="font-family: monospace; max-width: 520px; margin: 0 auto; padding: 32px; color: #111;">
          <div style="font-size: 18px; font-weight: 500; margin-bottom: 24px;">[CoLab]</div>
          <p style="font-size: 14px; margin-bottom: 16px;">
            <strong>${application.applicant_name}</strong> applied to collaborate on
            <strong>${project.title}</strong>.
          </p>
          ${application.applicant_role ? `<p style="font-size: 13px; color: #555; margin-bottom: 8px;">Role: ${application.applicant_role}</p>` : ""}
          ${application.availability ? `<p style="font-size: 13px; color: #555; margin-bottom: 8px;">Availability: ${application.availability}</p>` : ""}
          ${application.motivation ? `
          <div style="margin: 20px 0; padding: 14px; background: #f5f5f5; border-radius: 8px;">
            <div style="font-size: 11px; letter-spacing: 1px; color: #aaa; margin-bottom: 6px;">WHY THEY WANT TO JOIN</div>
            <p style="font-size: 13px; line-height: 1.7; margin: 0;">${application.motivation}</p>
          </div>` : ""}
          <a href="https://colab.build" style="display: inline-block; margin-top: 24px; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; border-radius: 8px; font-size: 13px;">Review application →</a>
          <p style="font-size: 11px; color: #aaa; margin-top: 32px;">CoLab · find collaborators, ship together</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    return new Response("email failed", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
