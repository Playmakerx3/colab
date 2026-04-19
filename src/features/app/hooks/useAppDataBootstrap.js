import { useCallback } from "react";
import { fetchAppBootstrapData } from "../services/appDataBootstrapService";

function mapDbNotif(n) {
  return {
    id: n.id,
    entityId: n.entity_id,
    type: n.type,
    text: n.text,
    sub: n.sub || "",
    time: new Date(n.created_at).toLocaleDateString(),
    createdAt: n.created_at,
    read: n.read,
    projectId: n.project_id,
    ...(n.type === "application" && n.metadata ? {
      applicant: {
        id: n.metadata.applicant_id,
        initials: n.metadata.applicant_initials,
        name: n.metadata.applicant_name,
        role: n.metadata.applicant_role,
        bio: n.metadata.applicant_bio,
        skills: n.metadata.applicant_skills || [],
        availability: n.metadata.availability,
        motivation: n.metadata.motivation,
      },
    } : {}),
    ...(n.type === "application_status" ? { status: n.metadata?.status } : {}),
    ...(n.type === "follow" ? { userId: n.entity_id } : {}),
    ...(n.type === "repost" ? { postId: n.entity_id } : {}),
  };
}

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
  setTeamReviews,
  setCommunities,
  setJoinedCommunityIds,
  setCommunityVotes,
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
        mentionNotifs,
        notifs,
        reviewsData,
        communitiesData,
        myMembershipsData,
        myVotesData,
      } = await fetchAppBootstrapData(userId);

      setProjects(projs || []);
      setTasks(allTasks || []);
      setUsers(usrs || []);
      setApplications(apps || []);
      setFollowers((fols || []).map(f => f.follower_id));
      setFollowing((folsByMe || []).map(f => f.following_id));
      setDmThreads(threads || []);
      setPortfolioItems(port || []);
      setPosts(postsData || []);
      setPostLikes({ myLikes: (likesData || []).map(l => l.post_id) });
      setPostReposts({ myReposts: (repostsData || []).map(r => r.post_id) });
      setMentionNotifications(mentionNotifs || []);
      setNotifications((notifs || []).map(mapDbNotif));
      setTeamReviews(reviewsData || []);
      setCommunities(communitiesData || []);
      setJoinedCommunityIds((myMembershipsData || []).map(m => m.community_id));
      // votes: { postId: true }
      const votesMap = {};
      (myVotesData || []).forEach(v => { votesMap[v.post_id] = true; });
      setCommunityVotes(votesMap);

      const trending = [...(projs || [])].sort((a, b) => {
        const aCount = (apps || []).filter(ap => ap.project_id === a.id).length;
        const bCount = (apps || []).filter(ap => ap.project_id === b.id).length;
        return bCount - aCount;
      }).slice(0, 3);
      setTrendingProjects(trending);

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
    setTeamReviews,
    setTrendingProjects,
    setUsers,
    setCommunities,
    setJoinedCommunityIds,
    setCommunityVotes,
  ]);

  return { loadAllData };
}
