import { useCallback } from "react";
import { fetchAppBootstrapData } from "../services/appDataBootstrapService";

export function useAppDataBootstrap({
  setLoading,
  setProjects,
  setUsers,
  setApplications,
  setFollowers,
  setFollowing,
  setDmThreads,
  setPortfolioItems,
  setPosts,
  setPostLikes,
  setMentionNotifications,
  setTrendingProjects,
  setSkillCategoryCount,
  setLiveStats,
  setNotifications,
  setShowApplicationForm,
}) {
  const loadAllData = useCallback(async (userId) => {
    setLoading(true);
    try {
      const {
        projs,
        usrs,
        apps,
        fols,
        folsByMe,
        threads,
        port,
        postsData,
        likesData,
        mentionNotifs,
      } = await fetchAppBootstrapData(userId);

      setProjects(projs || []);
      setUsers(usrs || []);
      setApplications(apps || []);
      setFollowers((fols || []).map(f => f.follower_id)); // IDs of people who follow you
      setFollowing((folsByMe || []).map(f => f.following_id)); // IDs you follow
      setDmThreads(threads || []);
      setPortfolioItems(port || []);
      setPosts(postsData || []);
      setPostLikes({ myLikes: (likesData || []).map(l => l.post_id) });
      setMentionNotifications(mentionNotifs || []);

      // Trending — top 3 projects by applicant count
      const trending = [...(projs || [])].sort((a, b) => {
        const aCount = (apps || []).filter(ap => ap.project_id === a.id).length;
        const bCount = (apps || []).filter(ap => ap.project_id === b.id).length;
        return bCount - aCount;
      }).slice(0, 3);
      setTrendingProjects(trending);

      const allSkills = new Set((projs || []).flatMap(p => p.skills || []));
      setSkillCategoryCount(allSkills.size || 48);
      setLiveStats({ builders: (usrs || []).length, projects: (projs || []).length });

      const myProjectIds = (projs || []).filter(p => p.owner_id === userId).map(p => p.id);
      const incoming = (apps || []).filter(a => myProjectIds.includes(a.project_id) && a.status === "pending");
      setNotifications(incoming.map(a => ({
        id: a.id,
        type: "application",
        text: `${a.applicant_name} applied to your project`,
        sub: (projs || []).find(p => p.id === a.project_id)?.title || "",
        time: new Date(a.created_at).toLocaleDateString(),
        read: false,
        projectId: a.project_id,
        applicant: {
          id: a.applicant_id,
          initials: a.applicant_initials,
          name: a.applicant_name,
          role: a.applicant_role,
          bio: a.applicant_bio,
          skills: a.applicant_skills || [],
          availability: a.availability,
          motivation: a.motivation,
          portfolio_url: a.portfolio_url,
        },
      })));

      // ── PENDING APPLY FROM PUBLIC PAGE ──
      const pendingApply = sessionStorage.getItem("pendingApply");
      if (pendingApply) {
        try {
          const { projectId } = JSON.parse(pendingApply);
          sessionStorage.removeItem("pendingApply");
          const proj = (projs || []).find(p => p.id === projectId);
          if (proj) setTimeout(() => setShowApplicationForm(proj), 400);
        } catch (error) {
          console.warn("Failed to parse pendingApply from sessionStorage", error);
        }
      }
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  }, [
    setApplications,
    setDmThreads,
    setFollowers,
    setFollowing,
    setLiveStats,
    setLoading,
    setMentionNotifications,
    setNotifications,
    setPortfolioItems,
    setPostLikes,
    setPosts,
    setProjects,
    setShowApplicationForm,
    setSkillCategoryCount,
    setTrendingProjects,
    setUsers,
  ]);

  return { loadAllData };
}
