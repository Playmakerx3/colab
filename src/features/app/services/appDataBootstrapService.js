import { supabase } from "../../../supabase";

export async function fetchAppBootstrapData(userId) {
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
    { data: mentionNotifs },
  ] = await Promise.all([
    supabase.from("projects").select("*").order("created_at", { ascending: false }),
    supabase.from("tasks").select("*"),
    supabase.from("profiles").select("*"),
    supabase.from("applications").select("*"),
    supabase.from("follows").select("*").eq("following_id", userId), // people who follow YOU
    supabase.from("follows").select("*").eq("follower_id", userId), // people YOU follow
    supabase.from("dm_threads").select("*").or(`user_a.eq.${userId},user_b.eq.${userId}`),
    supabase.from("portfolio_items").select("*").eq("user_id", userId),
    supabase.from("posts").select("*").order("created_at", { ascending: false }),
    supabase.from("likes").select("*").eq("user_id", userId),
    supabase.from("post_reposts").select("*").eq("user_id", userId),
    supabase.from("mention_notifications").select("*").eq("user_id", userId).eq("read", false).order("created_at", { ascending: false }),
  ]);

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
    mentionNotifs,
  };
}
