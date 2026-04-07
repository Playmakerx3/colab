import { useCallback } from "react";
import { fetchAppBootstrapData } from "../services/appDataBootstrapService";

export function useAppDataBootstrap({
  setLoading,
  setProjects,
  setTasks,
  setUsers,
  setApplications,
  setFollowers,
  setFollowing,
  setDmThreads,
  setPortfolioItems,
  setPosts,
  setPostLikes,
  setPostReposts,
  setMentionNotifications,
  setTrendingProjects,
  setNotifications,
  setShowApplicationForm,
}) {
  const loadAllData = useCallback(async (userId) => {
    setLoading(true);
    try {
      const {
        projs,
        allTasks,
        usrs,
        apps,
        fols,
        folsByMe,
        threads,
        port,
        postsData,
        likesData,
        repostsData,
        allRepostsData,
        mentionNotifs,
      } = await fetchAppBootstrapData(userId);

      setProjects(projs || []);
      setTasks(allTasks || []);
      setUsers(usrs || []);
      setApplications(apps || []);
      setFollowers((fols || []).map(f => f.follower_id)); // IDs of people who follow you
      setFollowing((folsByMe || []).map(f => f.following_id)); // IDs you follow
      setDmThreads(threads || []);
      setPortfolioItems(port || []);
      setPosts(postsData || []);
      setPostLikes({ myLikes: (likesData || []).map(l => l.post_id) });
      setPostReposts({ myReposts: (repostsData || []).map(r => r.post_id) });
      setMentionNotifications(mentionNotifs || []);

      const normalizeApplicationStatus = (status) => {
        if (status === "declined") return "rejected";
        return status || "pending";
      };

      // Trending — top 3 projects by applicant count
      const trending = [...(projs || [])].sort((a, b) => {
        const aCount = (apps || []).filter(ap => ap.project_id === a.id).length;
        const bCount = (apps || []).filter(ap => ap.project_id === b.id).length;
        return bCount - aCount;
      }).slice(0, 3);
      setTrendingProjects(trending);

      const myProjectIds = (projs || []).filter((p) => p.owner_id === userId).map((p) => p.id);
      const incoming = (apps || []).filter((a) => myProjectIds.includes(a.project_id) && normalizeApplicationStatus(a.status) === "pending");
      const ownerNotifications = incoming.map((a) => ({
        id: `application:new:${a.id}`,
        entityId: a.id,
        type: "application",
        text: `${a.applicant_name} applied to your project`,
        sub: (projs || []).find((p) => p.id === a.project_id)?.title || "",
        time: new Date(a.created_at).toLocaleDateString(),
        createdAt: a.created_at || new Date().toISOString(),
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
      }));

      const applicantNotifications = (apps || [])
        .filter((a) => a.applicant_id === userId)
        .filter((a) => ["accepted", "rejected", "declined"].includes(normalizeApplicationStatus(a.status)))
        .map((a) => {
          const normalizedStatus = normalizeApplicationStatus(a.status);
          const projectTitle = (projs || []).find((p) => p.id === a.project_id)?.title || "a project";
          return {
            id: `application:status:${a.id}`,
            entityId: a.id,
            type: "application_status",
            text: `Your application was ${normalizedStatus}`,
            sub: projectTitle,
            time: new Date(a.updated_at || a.created_at).toLocaleDateString(),
            createdAt: a.updated_at || a.created_at || new Date().toISOString(),
            read: false,
            projectId: a.project_id,
            status: normalizedStatus,
          };
        });

      const followerNotifications = (fols || []).map((followRow) => {
        const follower = (usrs || []).find((u) => u.id === followRow.follower_id);
        return {
          id: `follow:${followRow.id || followRow.follower_id}`,
          entityId: followRow.id || followRow.follower_id,
          type: "follow",
          text: `${follower?.name || "Someone"} followed you`,
          sub: follower?.role || "",
          time: new Date(followRow.created_at || Date.now()).toLocaleDateString(),
          createdAt: followRow.created_at || new Date().toISOString(),
          read: false,
          userId: followRow.follower_id,
        };
      });

      const repostNotifications = (allRepostsData || [])
        .map((repost) => {
          const post = (postsData || []).find((candidate) => candidate.id === repost.post_id);
          if (!post || post.user_id !== userId || repost.user_id === userId) return null;
          const actor = (usrs || []).find((u) => u.id === repost.user_id);
          return {
            id: `repost:${repost.id || `${repost.user_id}-${repost.post_id}`}`,
            entityId: repost.id || `${repost.user_id}-${repost.post_id}`,
            type: "repost",
            text: `${actor?.name || "Someone"} reposted your post`,
            sub: post.content ? post.content.slice(0, 68) : "",
            time: new Date(repost.created_at || Date.now()).toLocaleDateString(),
            createdAt: repost.created_at || new Date().toISOString(),
            read: false,
            postId: post.id,
          };
        })
        .filter(Boolean);

      const dismissedIds = new Set(JSON.parse(localStorage.getItem("dismissedNotifIds") || "[]"));
      const combinedNotifications = [...ownerNotifications, ...applicantNotifications, ...followerNotifications, ...repostNotifications]
        .filter((n) => !dismissedIds.has(n.id))
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setNotifications(combinedNotifications);

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
    setTasks,
    setDmThreads,
    setFollowers,
    setFollowing,
    setLoading,
    setMentionNotifications,
    setNotifications,
    setPortfolioItems,
    setPostLikes,
    setPostReposts,
    setPosts,
    setProjects,
    setShowApplicationForm,
    setTrendingProjects,
    setUsers,
  ]);

  return { loadAllData };
}
