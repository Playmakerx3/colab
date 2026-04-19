import { supabase } from "../../../supabase";

export const createApplication = async ({
  projectId,
  applicantId,
  applicantName,
  applicantInitials,
  applicantRole,
  applicantBio,
  applicantSkills,
  availability,
  role,
  motivation,
  portfolioUrl,
}) => {
  return supabase.from("applications").insert({
    project_id: projectId,
    applicant_id: applicantId,
    applicant_name: applicantName,
    applicant_initials: applicantInitials,
    applicant_role: applicantRole,
    applicant_bio: applicantBio,
    applicant_skills: applicantSkills,
    availability,
    role,
    motivation,
    portfolio_url: portfolioUrl,
    status: "pending",
  }).select().single();
};

export const deleteApplication = async (applicationId) => {
  return supabase.from("applications").delete().eq("id", applicationId);
};

export const updateApplicationStatus = async ({ applicationId, status }) => {
  return supabase.from("applications").update({ status }).eq("id", applicationId);
};
