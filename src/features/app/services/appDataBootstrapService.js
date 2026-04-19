import { supabase } from "../../../supabase";

export async function fetchAppBootstrapData(userId) {
  // Core data — must succeed for the app to function
  const [
    { data: projs },
    { data: allTasks },
    { data: usrs },
    { data: apps },
    { data: fols },
    { data: folsByMe },
    { data: threads },
    { data: port },
    { data: postsData },
    { data: likesData },
    { data: repostsData },
    { data: allRepostsData },
    { data: mentionNotifs },
    { data: notifs },
    { data: reviewsData },
  ] = await Promise.all([
    supabase.from("projects").select("*").order("created_at", { ascending: false }),
    supabase.from("tasks").select("*"),
    supabase.from("profiles").select("*"),
    supabase.from("applications").select("*"),
    supabase.from("follows").select("*").eq("following_id", userId),
    supabase.from("follows").select("*").eq("follower_id", userId),
    supabase.from("dm_threads").select("*").or(`user_a.eq.${userId},user_b.eq.${userId}`),
    supabase.from("portfolio_items").select("*").eq("user_id", userId),
    supabase.from("posts").select("*").order("created_at", { ascending: false }),
    supabase.from("likes").select("*").eq("user_id", userId),
    supabase.from("post_reposts").select("*").eq("user_id", userId),
    supabase.from("post_reposts").select("*, posts!inner(user_id)").eq("posts.user_id", userId),
    supabase.from("mention_notifications").select("*").eq("user_id", userId).eq("read", false).order("created_at", { ascending: false }),
    supabase.from("notifications").select("*").eq("user_id", userId).eq("read", false).order("created_at", { ascending: false }),
    supabase.from("team_reviews").select("*"),
  ]);

  // Communities data — fetched separately so a missing table never breaks core load
  let communitiesData = [], myMembershipsData = [], myVotesData = [];
  try {
    const [{ data: c }, { data: m }, { data: v }] = await Promise.all([
      supabase.from("communities").select("*").order("name"),
      supabase.from("community_members").select("*").eq("user_id", userId),
      supabase.from("community_post_votes").select("*").eq("user_id", userId),
    ]);
    communitiesData = c || [];
    myMembershipsData = m || [];
    myVotesData = v || [];
  } catch (e) {
    console.warn("Communities tables not yet available — run the SQL migration.", e);
  }

  return {
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
    notifs,
    reviewsData,
    communitiesData,
    myMembershipsData,
    myVotesData,
  };
}

export async function fetchCommunityPosts(communityId) {
  const { data: posts } = await supabase
    .from("community_posts")
    .select("*")
    .eq("community_id", communityId)
    .order("created_at", { ascending: false });
  return { posts: posts || [] };
}

export async function fetchThreadComments(postId) {
  const { data } = await supabase
    .from("community_comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at");
  return data || [];
}

export async function fetchTopCommunityPosts(communityIds) {
  if (!communityIds || communityIds.length === 0) return [];
  try {
    const { data } = await supabase
      .from("community_posts")
      .select("*, communities(name, emoji, slug)")
      .in("community_id", communityIds)
      .order("upvotes", { ascending: false })
      .limit(6);
    return data || [];
  } catch (e) {
    return [];
  }
}
