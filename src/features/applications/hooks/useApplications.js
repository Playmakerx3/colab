import { useState } from "react";
import {
  createApplication,
  deleteApplication,
  updateApplicationStatus,
} from "../services/applicationsService";

export function useApplications({
  authUser,
  profile,
  myInitials,
  showApplicationForm,
  setShowApplicationForm,
  applications,
  users,
  setApplications,
  setNotifications,
  showToast,
  loadAllData,
  logActivity,
  openDm,
}) {
  const [applicationSuccess, setApplicationSuccess] = useState(false);
  const [applicationForm, setApplicationForm] = useState({
    skills: [],
    availability: "",
    motivation: "",
    portfolio_url: "",
  });
  const [reviewingApplicants, setReviewingApplicants] = useState(null);
  const [selectedApplicant, setSelectedApplicant] = useState(null);

  const openApplicationForm = (project) => {
    const matchingSkills = (project?.skills || []).filter((s) => (profile?.skills || []).includes(s));
    setApplicationForm({ skills: matchingSkills, availability: "", motivation: "", portfolio_url: "" });
    setApplicationSuccess(false);
    setShowApplicationForm(project);
  };

  const closeApplicationForm = () => {
    setShowApplicationForm(null);
    setApplicationSuccess(false);
  };

  const openReviewApplicants = (project) => {
    setSelectedApplicant(null);
    setReviewingApplicants(project);
  };

  const closeReviewApplicants = () => {
    setSelectedApplicant(null);
    setReviewingApplicants(null);
  };

  const handleApply = async () => {
    const project = showApplicationForm;
    if (!project) return;

    const existing = applications.find((a) => a.project_id === project.id && a.applicant_id === authUser.id);
    if (existing) {
      if (existing.status === "pending") {
        showToast("Already applied.");
        return;
      }
      if (existing.status === "accepted") {
        showToast("You're already on this project.");
        return;
      }
      if (existing.status === "declined") {
        const hoursSince = (Date.now() - new Date(existing.updated_at || existing.created_at).getTime()) / 3600000;
        if (hoursSince < 24) {
          showToast(`You can reapply in ${Math.ceil(24 - hoursSince)}h`);
          return;
        }
        await deleteApplication(existing.id);
        setApplications((prev) => prev.filter((a) => a.id !== existing.id));
      }
    }

    const { data, error } = await createApplication({
      projectId: project.id,
      applicantId: authUser.id,
      applicantName: profile.name,
      applicantInitials: myInitials,
      applicantRole: profile.role || "",
      applicantBio: profile.bio || "",
      applicantSkills: applicationForm.skills || [],
      availability: applicationForm.availability || "",
      motivation: applicationForm.motivation || "",
      portfolioUrl: applicationForm.portfolio_url || "",
    });

    if (error) {
      showToast("Error submitting. Try again.");
      return;
    }

    if (data) {
      setApplications((prev) => [...prev, data]);
      setApplicationSuccess(true);
    }
  };

  const handleRemoveDeniedApp = async (appId) => {
    await deleteApplication(appId);
    setApplications((prev) => prev.filter((a) => a.id !== appId));
    showToast("Application removed.");
  };

  const handleAccept = async (notif) => {
    await updateApplicationStatus({ applicationId: notif.id, status: "accepted" });
    setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
    showToast(`${notif.applicant.name} accepted!`);
    logActivity(notif.projectId, "member_joined", `${notif.applicant.name} joined the project`);
    loadAllData(authUser.id);
  };

  const handleDecline = async (notif) => {
    await updateApplicationStatus({ applicationId: notif.id, status: "declined" });
    setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
    showToast("Application declined.");
  };

  const getProjectPendingApplications = (projectId) => {
    return applications.filter((a) => a.project_id === projectId && a.status === "pending");
  };

  const handleReviewDecline = async () => {
    if (!selectedApplicant) return;
    const { error } = await updateApplicationStatus({ applicationId: selectedApplicant.id, status: "declined" });
    if (error) {
      showToast("Failed to decline. Try again.");
      return;
    }
    setApplications((prev) => prev.filter((a) => a.id !== selectedApplicant.id));
    setSelectedApplicant(null);
    showToast("Declined.");
  };

  const handleReviewAccept = async () => {
    if (!selectedApplicant) return;
    const { error } = await updateApplicationStatus({ applicationId: selectedApplicant.id, status: "accepted" });
    if (error) {
      showToast("Failed to accept. Try again.");
      return;
    }
    setApplications((prev) => prev.filter((a) => a.id !== selectedApplicant.id));
    const u = users.find((user) => user.id === selectedApplicant.applicant_id);
    if (u) openDm(u);
    showToast(`${selectedApplicant.applicant_name} accepted!`);
    closeReviewApplicants();
  };

  return {
    applicationSuccess,
    applicationForm,
    setApplicationForm,
    reviewingApplicants,
    openApplicationForm,
    openReviewApplicants,
    closeReviewApplicants,
    selectedApplicant,
    setSelectedApplicant,
    closeApplicationForm,
    handleApply,
    handleRemoveDeniedApp,
    handleAccept,
    handleDecline,
    getProjectPendingApplications,
    handleReviewDecline,
    handleReviewAccept,
  };
}
