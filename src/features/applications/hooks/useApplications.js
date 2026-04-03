import { useCallback, useEffect, useState } from "react";
import {
  createApplication,
  deleteApplicationById,
  updateApplicationStatus,
} from "../services/applicationsService";

const EMPTY_APPLICATION_FORM = { skills: [], availability: "", motivation: "", portfolio_url: "" };

export function useApplications({
  showApplicationForm,
  profile,
  authUser,
  myInitials,
  applications,
  setApplications,
  setNotifications,
  setActiveProject,
  loadAllData,
  logActivity,
  showToast,
}) {
  const [applicationSuccess, setApplicationSuccess] = useState(false);
  const [applicationForm, setApplicationForm] = useState(EMPTY_APPLICATION_FORM);

  useEffect(() => {
    if (!showApplicationForm) return;
    const matchingSkills = (showApplicationForm.skills || []).filter((s) => (profile?.skills || []).includes(s));
    const timer = setTimeout(() => {
      setApplicationForm({ skills: matchingSkills, availability: "", motivation: "", portfolio_url: "" });
      setApplicationSuccess(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [showApplicationForm, profile?.skills]);

  const handleApply = useCallback(async () => {
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
        await deleteApplicationById(existing.id);
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
      availability: applicationForm.availability || "",
      motivation: applicationForm.motivation || "",
      portfolioUrl: applicationForm.portfolio_url || "",
    });

    if (error) {
      showToast("Error submitting. Try again.");
      return;
    }

    if (data) {
      setApplications([...applications, data]);
      setApplicationSuccess(true);
    }
  }, [
    applications,
    applicationForm.availability,
    applicationForm.motivation,
    applicationForm.portfolio_url,
    authUser.id,
    myInitials,
    profile.bio,
    profile.name,
    profile.role,
    setApplications,
    showApplicationForm,
    showToast,
  ]);

  const handleRemoveDeniedApp = useCallback(async (appId) => {
    await deleteApplicationById(appId);
    setApplications((prev) => prev.filter((a) => a.id !== appId));
    showToast("Application removed.");
  }, [setApplications, showToast]);

  const handleAccept = useCallback(async (notif) => {
    await updateApplicationStatus({ applicationId: notif.id, status: "accepted" });
    setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
    showToast(`${notif.applicant.name} accepted!`);
    logActivity(notif.projectId, "member_joined", `${notif.applicant.name} joined the project`);
    loadAllData(authUser.id);
  }, [authUser.id, loadAllData, logActivity, setNotifications, showToast]);

  const handleDecline = useCallback(async (notif) => {
    await updateApplicationStatus({ applicationId: notif.id, status: "declined" });
    setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
    showToast("Application declined.");
  }, [setNotifications, showToast]);

  const handleLeaveProject = useCallback(async (applicationId) => {
    if (!window.confirm("Leave this project? You'll need to re-apply to rejoin.")) return;
    await updateApplicationStatus({ applicationId, status: "left" });
    setApplications((prev) => prev.map((a) => (a.id === applicationId ? { ...a, status: "left" } : a)));
    setActiveProject(null);
    showToast("You've left the project.");
  }, [setActiveProject, setApplications, showToast]);

  const handleReviewDecline = useCallback(async (selected) => {
    const { error } = await updateApplicationStatus({ applicationId: selected.id, status: "declined" });
    if (error) {
      showToast("Failed to decline. Try again.");
      return false;
    }
    setApplications((prev) => prev.filter((a) => a.id !== selected.id));
    showToast("Declined.");
    return true;
  }, [setApplications, showToast]);

  const handleReviewAccept = useCallback(async (selected) => {
    const { error } = await updateApplicationStatus({ applicationId: selected.id, status: "accepted" });
    if (error) {
      showToast("Failed to accept. Try again.");
      return null;
    }
    setApplications((prev) => prev.filter((a) => a.id !== selected.id));
    showToast(`${selected.applicant_name} accepted!`);
    return selected.applicant_id;
  }, [setApplications, showToast]);

  return {
    applicationSuccess,
    setApplicationSuccess,
    applicationForm,
    setApplicationForm,
    handleApply,
    handleRemoveDeniedApp,
    handleAccept,
    handleDecline,
    handleLeaveProject,
    handleReviewDecline,
    handleReviewAccept,
  };
}
