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
        const myProjectIds = projectsRef.current.filter((p) => p.owner_id === authUser?.id).map((p) => p.id);
        if (myProjectIds.includes(payload.new.project_id)) {
          const proj = projectsRef.current.find((p) => p.id === payload.new.project_id);
          setNotifications((prev) => {
            const notificationId = `application:new:${payload.new.id}`;
            if (prev.find((n) => n.id === notificationId)) return prev;
            const dismissed = new Set(JSON.parse(localStorage.getItem("dismissedNotifIds") || "[]"));
            if (dismissed.has(notificationId)) return prev;
            return [{
              id: notificationId, entityId: payload.new.id, type: "application",
              text: `${payload.new.applicant_name} applied to your project`,
              sub: proj?.title || "", time: "just now", read: false,
              projectId: payload.new.project_id,
              applicant: { id: payload.new.applicant_id, initials: payload.new.applicant_initials, name: payload.new.applicant_name, role: payload.new.applicant_role, bio: payload.new.applicant_bio, skills: payload.new.applicant_skills || [], availability: payload.new.availability, motivation: payload.new.motivation }
            }, ...prev];
          });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "applications" }, (payload) => {
        setApplications((prev) => prev.map((application) => (application.id === payload.new.id ? payload.new : application)));
        if (payload.new.applicant_id === authUser?.id) {
          const oldStatus = payload.old.status === "declined" ? "rejected" : payload.old.status;
          const newStatus = payload.new.status === "declined" ? "rejected" : payload.new.status;
          if (oldStatus !== newStatus && ["accepted", "rejected"].includes(newStatus)) {
            const project = projectsRef.current.find((p) => p.id === payload.new.project_id);
            setNotifications((prev) => {
              const notificationId = `application:status:${payload.new.id}`;
              if (prev.find((notification) => notification.id === notificationId)) return prev;
              const dismissed = new Set(JSON.parse(localStorage.getItem("dismissedNotifIds") || "[]"));
              if (dismissed.has(notificationId)) return prev;
              return [{
                id: notificationId,
                entityId: payload.new.id,
                type: "application_status",
                text: `Your application was ${newStatus}`,
                sub: project?.title || "Project",
                time: "just now",
                read: false,
                projectId: payload.new.project_id,
                status: newStatus,
              }, ...prev];
            });
          }
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "follows" }, (payload) => {
        if (payload.new.following_id !== authUser?.id) return;
        setFollowers((prev) => (prev.includes(payload.new.follower_id) ? prev : [...prev, payload.new.follower_id]));
        const follower = usersRef.current.find((user) => user.id === payload.new.follower_id);
        setNotifications((prev) => {
          const notifId = `follow:${payload.new.id || payload.new.follower_id}`;
          const dismissed = new Set(JSON.parse(localStorage.getItem("dismissedNotifIds") || "[]"));
          if (dismissed.has(notifId)) return prev;
          return [{
          id: notifId,
          entityId: payload.new.id || payload.new.follower_id,
          type: "follow",
          text: `${follower?.name || "Someone"} followed you`,
          sub: follower?.role || "",
          time: "just now",
          read: false,
          userId: payload.new.follower_id,
        }, ...prev];
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_reposts" }, (payload) => {
        const post = postsRef.current.find((entry) => entry.id === payload.new.post_id);
        if (!post || post.user_id !== authUser?.id || payload.new.user_id === authUser?.id) return;
        const actor = usersRef.current.find((user) => user.id === payload.new.user_id);
        setNotifications((prev) => {
          const notifId = `repost:${payload.new.id || `${payload.new.user_id}-${payload.new.post_id}`}`;
          const dismissed = new Set(JSON.parse(localStorage.getItem("dismissedNotifIds") || "[]"));
          if (dismissed.has(notifId)) return prev;
          return [{
            id: notifId,
            entityId: payload.new.id || `${payload.new.user_id}-${payload.new.post_id}`,
            type: "repost",
            text: `${actor?.name || "Someone"} reposted your post`,
            sub: post.content ? post.content.slice(0, 68) : "",
            time: "just now",
            read: false,
            postId: post.id,
          }, ...prev];
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
