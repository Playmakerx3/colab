import { useEffect, useRef } from "react";
import { supabase } from "../../../supabase";

export function useRealtimeSubscriptions({
  authUser,
  activeProject,
  activeDmThread,
  projects,
  users,
  posts,
  messagesEndRef,
  dmEndRef,
  setMessages,
  setDmMessages,
  setDmThreads,
  setApplications,
  setNotifications,
  setProjects,
  setPosts,
  setFollowers,
  onIncomingPost,
  setMentionNotifications,
}) {
  const shouldAutoScroll = (endRef) => {
    const el = endRef?.current?.parentElement;
    if (!el) return true;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    return distanceFromBottom < 80;
  };
  const upsertIncoming = (list, incoming) => {
    if (list.find((m) => m.id === incoming.id)) return list;
    const optimisticIdx = list.findIndex((m) =>
      String(m.id || "").startsWith("temp-") &&
      ((m.thread_id && m.thread_id === incoming.thread_id) || (m.project_id && m.project_id === incoming.project_id)) &&
      ((m.sender_id && m.sender_id === incoming.sender_id) || (m.from_user && m.from_user === incoming.from_user)) &&
      m.text === incoming.text
    );
    if (optimisticIdx >= 0) {
      const copy = [...list];
      copy[optimisticIdx] = incoming;
      return copy;
    }
    return [...list, incoming];
  };
  // Ref so realtime callbacks always see current data without re-subscribing
  const projectsRef = useRef([]);
  const usersRef = useRef([]);
  const postsRef = useRef([]);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);
  useEffect(() => {
    usersRef.current = users;
  }, [users]);
  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    if (!authUser || !activeProject?.id) return;
    const projectChannel = supabase
      .channel(`messages:project:${activeProject.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `project_id=eq.${activeProject.id}`,
        },
        (payload) => {
          const canScroll = shouldAutoScroll(messagesEndRef);
          setMessages((prev) => upsertIncoming(prev, payload.new));
          if (canScroll) messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(projectChannel);
    };
  }, [authUser, activeProject?.id, messagesEndRef, setMessages]);

  useEffect(() => {
    if (!authUser || !activeDmThread?.id) return;
    const dmChannel = supabase
      .channel(`messages:dm:${activeDmThread.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_messages",
          filter: `thread_id=eq.${activeDmThread.id}`,
        },
        (payload) => {
          setDmMessages((prev) => {
            const threadId = payload.new.thread_id;
            const existing = prev[threadId] || [];
            return { ...prev, [threadId]: upsertIncoming(existing, payload.new) };
          });
          if (shouldAutoScroll(dmEndRef)) dmEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(dmChannel);
    };
  }, [authUser, activeDmThread?.id, dmEndRef, setDmMessages]);

  // Keep dependency timing aligned with existing App subscription lifecycle.
  useEffect(() => {
    if (!authUser) return;
    const channel = supabase
      .channel("realtime-colab")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" }, (payload) => {
        if (activeDmThread?.id === payload.new.thread_id) return;
        // Always update DM messages — works even when not on messages tab
        setDmMessages((prev) => {
          const threadId = payload.new.thread_id;
          const existing = prev[threadId] || [];
          return { ...prev, [threadId]: upsertIncoming(existing, payload.new) };
        });
        // Show notification dot if message is from someone else and we're not on messages tab
        if (payload.new.sender_id !== authUser?.id && activeDmThread?.id !== payload.new.thread_id) {
          setDmThreads((prev) =>
            prev.map((t) =>
              t.id === payload.new.thread_id ? { ...t, unread: true } : t
            )
          );
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "applications" }, (payload) => {
        setApplications((prev) => {
          if (prev.find((a) => a.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "applications" }, (payload) => {
        setApplications((prev) => prev.map((a) => (a.id === payload.new.id ? payload.new : a)));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "follows" }, (payload) => {
        if (payload.new.following_id !== authUser?.id) return;
        setFollowers((prev) => (prev.includes(payload.new.follower_id) ? prev : [...prev, payload.new.follower_id]));
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications",
        filter: `user_id=eq.${authUser.id}`,
      }, (payload) => {
        const n = payload.new;
        setNotifications((prev) => {
          if (prev.find((x) => x.id === n.id)) return prev;
          const mapped = {
            id: n.id,
            entityId: n.entity_id,
            type: n.type,
            text: n.text,
            sub: n.sub || "",
            time: "just now",
            createdAt: n.created_at,
            read: false,
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
          return [mapped, ...prev];
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "projects" }, (payload) => {
        setProjects((prev) => {
          if (prev.find((p) => p.id === payload.new.id)) return prev;
          return [payload.new, ...prev];
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (payload) => {
        if (payload.new.user_id !== authUser?.id) {
          if (onIncomingPost) {
            onIncomingPost(payload.new);
            return;
          }
          setPosts((prev) => {
            if (prev.find((p) => p.id === payload.new.id)) return prev;
            return [payload.new, ...prev];
          });
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mention_notifications" }, (payload) => {
        if (payload.new.user_id === authUser?.id) {
          setMentionNotifications((prev) => [payload.new, ...prev]);
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, activeProject, activeDmThread]);
}
