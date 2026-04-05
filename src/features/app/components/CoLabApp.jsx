import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../../../supabase";
import { AVAILABILITY, CATEGORIES, COLS, PLUGINS, PRESETS, ROWS, SKILLS } from "../../../constants/appConstants";
import { initials, matchesRegion, relativeTime } from "../../../utils/appHelpers";
import Avatar from "../../../components/ui/Avatar";
import ProgressBar from "../../../components/ui/ProgressBar";
import Spinner from "../../../components/ui/Spinner";
import PixelBannerDisplay from "../../../components/ui/PixelBannerDisplay";
import { useAuthBootstrap } from "../../../hooks/useAuthBootstrap";
import { resetPassword, signIn, signOut, signUp } from "../../../services/authService";
import { useProfileState } from "../../profile/hooks/useProfileState";
import { useAppDataBootstrap } from "../hooks/useAppDataBootstrap";
import { useRealtimeSubscriptions } from "../../realtime/hooks/useRealtimeSubscriptions";
import { useMessaging } from "../../messaging/hooks/useMessaging";
import { useApplications } from "../../applications/hooks/useApplications";
import { useProjectWorkspace } from "../../projects/hooks/useProjectWorkspace";
import { computeProjectHealth, PROJECT_HEALTH, resolveTaskOwnership } from "../../projects/utils/projectHealth";

const isFreshTimestamp = (timestamp, windowMs = 120000) => {
  if (!timestamp) return false;
  return Date.now() - new Date(timestamp).getTime() < windowMs;
};

const getMediaType = (url = "") => {
  if (!url) return "none";
  const lower = url.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(lower)) return "image";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  return "link";
};

const getYouTubeId = (url = "") => {
  const shortMatch = url.match(/youtu\.be\/([^?&/]+)/i);
  if (shortMatch?.[1]) return shortMatch[1];
  const longMatch = url.match(/[?&]v=([^?&/]+)/i);
  if (longMatch?.[1]) return longMatch[1];
  const embedMatch = url.match(/youtube\.com\/embed\/([^?&/]+)/i);
  return embedMatch?.[1] || null;
};

const toHost = (url = "") => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "external link";
  }
};

const sharedFeedAudio = {
  activeElement: null,
};

const WAVEFORM_BAR_COUNT = 72;
const waveformDataCache = new Map();
let sharedAudioContext;

const getAudioContext = () => {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContextClass();
  }
  return sharedAudioContext;
};

const downsampleWaveform = (channelData, barCount = WAVEFORM_BAR_COUNT) => {
  if (!channelData?.length) return [];
  const bucketSize = Math.max(1, Math.floor(channelData.length / barCount));
  const downsampled = [];
  for (let i = 0; i < barCount; i += 1) {
    const start = i * bucketSize;
    const end = Math.min(start + bucketSize, channelData.length);
    if (start >= channelData.length) break;
    let sum = 0;
    for (let j = start; j < end; j += 1) {
      sum += Math.abs(channelData[j]);
    }
    const avg = end > start ? sum / (end - start) : 0;
    downsampled.push(avg);
  }
  return downsampled;
};

const normalizeWaveform = (values = []) => {
  if (!values.length) return [];
  const peak = Math.max(...values, 0.0001);
  return values.map((value) => {
    const normalized = value / peak;
    return Math.max(0.08, Math.min(1, normalized));
  });
};

const getWaveformData = async (audioUrl, signal) => {
  if (!audioUrl) return [];
  if (waveformDataCache.has(audioUrl)) {
    return waveformDataCache.get(audioUrl);
  }
  const waveformPromise = (async () => {
    const response = await fetch(audioUrl, { signal });
    if (!response.ok) {
      throw new Error(`Unable to fetch audio (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const audioContext = getAudioContext();
    if (!audioContext) return [];
    const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    if (!decodedBuffer.numberOfChannels) return [];
    const channelData = decodedBuffer.getChannelData(0);
    return normalizeWaveform(downsampleWaveform(channelData));
  })();
  waveformDataCache.set(audioUrl, waveformPromise);
  try {
    const waveform = await waveformPromise;
    waveformDataCache.set(audioUrl, waveform);
    return waveform;
  } catch (error) {
    waveformDataCache.delete(audioUrl);
    throw error;
  }
};

function AudioPostPlayer({ post, border, bg2, text, textMuted }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveformData, setWaveformData] = useState([]);
  const [waveformError, setWaveformError] = useState(false);
  const trackLabel = decodeURIComponent(post.media_url.split("/").pop().split("?")[0]).replace(/^\d+-/, "");
  const creatorLabel = post.user_name || "Unknown creator";
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const playedBars = waveformData.length ? Math.round((progressPct / 100) * waveformData.length) : 0;

  const togglePlayback = async () => {
    if (!audioRef.current) return;
    const audioContext = getAudioContext();
    if (audioContext?.state === "suspended") {
      try {
        await audioContext.resume();
      } catch {
        // no-op: native audio element playback still runs independently
      }
    }
    if (isPlaying) {
      audioRef.current.pause();
      return;
    }
    try {
      await audioRef.current.play();
    } catch {
      setIsPlaying(false);
    }
  };

  useEffect(() => () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    if (sharedFeedAudio.activeElement === audioRef.current) {
      sharedFeedAudio.activeElement = null;
    }
  }, []);

  const handlePlay = () => {
    const currentAudio = audioRef.current;
    if (!currentAudio) return;
    if (sharedFeedAudio.activeElement && sharedFeedAudio.activeElement !== currentAudio) {
      sharedFeedAudio.activeElement.pause();
    }
    sharedFeedAudio.activeElement = currentAudio;
    setIsPlaying(true);
  };

  const handlePause = () => {
    if (sharedFeedAudio.activeElement === audioRef.current) {
      sharedFeedAudio.activeElement = null;
    }
    setIsPlaying(false);
  };

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    let idleId = null;

    const runComputation = async () => {
      try {
        setWaveformError(false);
        const data = await getWaveformData(post.media_url, controller.signal);
        if (isMounted) setWaveformData(data);
      } catch {
        if (isMounted) {
          setWaveformData([]);
          setWaveformError(true);
        }
      }
    };

    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(() => {
        runComputation();
      });
    } else {
      idleId = window.setTimeout(() => {
        runComputation();
      }, 0);
    }

    return () => {
      isMounted = false;
      controller.abort();
      if (typeof window !== "undefined" && typeof window.cancelIdleCallback === "function" && idleId) {
        window.cancelIdleCallback(idleId);
      } else if (idleId) {
        window.clearTimeout(idleId);
      }
    };
  }, [post.media_url]);

  return (
    <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 8 }}>MUSIC</div>
      <div style={{ fontSize: 13, color: text, marginBottom: 2 }}>{trackLabel || "Untitled track"}</div>
      <div style={{ fontSize: 11, color: textMuted, marginBottom: 12 }}>by {creatorLabel}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="hb" onClick={togglePlayback} style={{ width: 32, height: 32, borderRadius: 999, border: `1px solid ${border}`, background: "none", color: text, fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
          {isPlaying ? "❚❚" : "▶"}
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ height: 44, display: "flex", alignItems: "flex-end", gap: 2, borderBottom: `1px solid ${border}`, paddingBottom: 6 }}>
            {waveformData.length ? waveformData.map((value, index) => (
              <div
                key={`${post.id}-wave-${index}`}
                style={{
                  flex: 1,
                  borderRadius: 999,
                  minHeight: 4,
                  height: `${Math.round(value * 100)}%`,
                  background: text,
                  opacity: index < playedBars ? 1 : 0.28,
                  transition: "opacity 0.12s linear",
                }}
              />
            )) : (
              <div style={{ width: "100%", fontSize: 10, color: textMuted, opacity: 0.8 }}>
                {waveformError ? "Waveform unavailable for this file." : "Building waveform..."}
              </div>
            )}
          </div>
          <div style={{ marginTop: 6, width: "100%", height: 4, borderRadius: 999, border: `1px solid ${border}`, overflow: "hidden" }}>
            <div style={{ width: `${progressPct}%`, height: "100%", background: text, transition: "width 0.12s linear" }} />
          </div>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={post.media_url}
        preload="metadata"
        onPlay={handlePlay}
        onPause={handlePause}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime || 0)}
        onEnded={handlePause}
        style={{ display: "none" }}
      />
    </div>
  );
}

const extractFirstUrl = (text = "") => {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s)]+/i);
  return match?.[0] || null;
};

const isGoogleDriveUrl = (url = "") => /(?:drive\.google\.com|docs\.google\.com)/i.test(url);

const normalizeGoogleDriveEmbed = (url = "") => {
  if (!isGoogleDriveUrl(url)) return null;
  try {
    const parsed = new URL(url);
    const fileIdMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/i);
    if (fileIdMatch?.[1]) return `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
    const docIdMatch = parsed.pathname.match(/\/document\/d\/([^/]+)/i);
    if (docIdMatch?.[1]) return `https://docs.google.com/document/d/${docIdMatch[1]}/preview`;
    const sheetIdMatch = parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/i);
    if (sheetIdMatch?.[1]) return `https://docs.google.com/spreadsheets/d/${sheetIdMatch[1]}/preview`;
    const slideIdMatch = parsed.pathname.match(/\/presentation\/d\/([^/]+)/i);
    if (slideIdMatch?.[1]) return `https://docs.google.com/presentation/d/${slideIdMatch[1]}/preview`;
  } catch {
    return null;
  }
  return null;
};

const GoogleDriveCard = ({ url, border, bg2, text, textMuted, compact = false }) => {
  if (!isGoogleDriveUrl(url)) return null;
  const embedUrl = normalizeGoogleDriveEmbed(url);
  const pathname = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const typeLabel = pathname.includes("/spreadsheets/") ? "Google Sheet"
    : pathname.includes("/presentation/") ? "Google Slides"
      : pathname.includes("/document/") ? "Google Doc"
        : "Google Drive file";

  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 10, background: bg2, overflow: "hidden" }}>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        style={{
          textDecoration: "none",
          color: text,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          padding: compact ? "10px 12px" : "12px 14px",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "0.8px", marginBottom: 3 }}>{typeLabel}</div>
          <div style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{toHost(url)}</div>
        </div>
        <span style={{ fontSize: 11, color: textMuted, flexShrink: 0 }}>open ↗</span>
      </a>
      {!compact && embedUrl && (
        <iframe
          title="google-drive-preview"
          src={embedUrl}
          style={{ width: "100%", height: 240, border: "none", borderTop: `1px solid ${border}` }}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
};

function PostCard({ post, ctx }) {
  const {
    postLikes, expandedComments, postComments, authUser, users,
    handleDeletePost, dark, border, text, textMuted, bg2, btnP, inputStyle,
    setViewingProfile, handleLike, setExpandedComments, loadComments,
    myInitials, setPostComments, profile, supabase, pendingLikeIds,
    commentPulseIds, pendingCommentByPost, recentActivityByPost, justInsertedPostIds,
    markCommentPending, markRecentActivity,
  } = ctx;
  const isLiked = (postLikes.myLikes || []).includes(post.id);
  const isOpen = expandedComments[post.id];
  const comments = postComments[post.id] || [];
  const isOwner = post.user_id === authUser?.id;
  const postUser = users.find(u => u.id === post.user_id);
  const isLikePending = pendingLikeIds.includes(post.id);
  const isCommentPending = pendingCommentByPost[post.id] > 0;
  const hasRecentActivity = recentActivityByPost[post.id] || isFreshTimestamp(post.created_at);
  const isFreshInsert = justInsertedPostIds.includes(post.id);
  const driveUrl = React.useMemo(() => {
    if (isGoogleDriveUrl(post.media_url || "")) return post.media_url;
    const linkedUrl = extractFirstUrl(post.content || "");
    return isGoogleDriveUrl(linkedUrl || "") ? linkedUrl : null;
  }, [post.media_url, post.content]);
  const [localComment, setLocalComment] = React.useState("");
  const [hovered, setHovered] = React.useState(false);

  const submitComment = async () => {
    if (!localComment.trim()) return;
    const content = localComment.trim();
    setLocalComment("");
    const optimisticId = `temp-${Date.now()}`;
    const optimisticComment = {
      id: optimisticId,
      post_id: post.id,
      user_id: authUser.id,
      user_name: profile.name,
      user_initials: myInitials,
      content,
      created_at: new Date().toISOString(),
      optimistic: true,
    };
    markCommentPending(post.id, 1);
    markRecentActivity(post.id);
    setPostComments((prev) => ({ ...prev, [post.id]: [...(prev[post.id] || []), optimisticComment] }));
    const { data, error } = await supabase.from("comments").insert({
      post_id: post.id, user_id: authUser.id,
      user_name: profile.name, user_initials: myInitials, content,
    }).select().single();
    if (error) {
      setPostComments((prev) => ({ ...prev, [post.id]: (prev[post.id] || []).filter((c) => c.id !== optimisticId) }));
      markCommentPending(post.id, -1);
      return;
    }
    if (data) {
      setPostComments((prev) => ({
        ...prev,
        [post.id]: (prev[post.id] || []).map((c) => (c.id === optimisticId ? data : c)),
      }));
    }
    markCommentPending(post.id, -1);
  };

  const handleDeleteComment = async (commentId) => {
    await supabase.from("comments").delete().eq("id", commentId);
    setPostComments(prev => ({ ...prev, [post.id]: (prev[post.id] || []).filter(c => c.id !== commentId) }));
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: `1px solid ${border}`,
        padding: "24px 0",
        transition: "background 0.15s, transform 0.25s ease, opacity 0.25s ease",
        animation: isFreshInsert ? "feedPostAppear 320ms ease-out" : "none",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
        <button onClick={() => postUser && setViewingProfile(postUser)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
          <Avatar initials={post.user_initials} size={40} dark={dark} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <button onClick={() => postUser && setViewingProfile(postUser)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: text }}>{post.user_name}</span>
              </button>
              {post.user_role && <span style={{ fontSize: 11, color: textMuted, marginLeft: 8 }}>{post.user_role}</span>}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                <div style={{ fontSize: 10, color: textMuted }}>{relativeTime(post.created_at)}</div>
                {hasRecentActivity && (
                  <span style={{ fontSize: 9, color: textMuted, border: `1px solid ${border}`, borderRadius: 20, padding: "1px 7px", background: bg2 }}>
                    live · just now
                  </span>
                )}
              </div>
            </div>
            {isOwner && hovered && (
              <button className="hb" onClick={() => handleDeletePost(post.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 11, fontFamily: "inherit", opacity: 0.6 }}>✕</button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ fontSize: 14, color: text, lineHeight: 1.75, marginBottom: 14, paddingLeft: 52, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{post.content}</div>

      {/* Media */}
      {post.media_url && !isGoogleDriveUrl(post.media_url) && (
        <div style={{ paddingLeft: 52, marginBottom: 14 }}>
          {(() => {
            const t = post.media_type || (
              post.media_url.includes("youtube.com") || post.media_url.includes("youtu.be") ? "youtube"
              : post.media_url.match(/\.(mp4|mov|webm)$/i) ? "video"
              : post.media_url.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i) ? "audio"
              : post.media_url.match(/\.pdf$/i) ? "pdf"
              : "image"
            );
            if (t === "youtube") {
              const ytId = post.media_url.includes("youtu.be/")
                ? post.media_url.split("youtu.be/")[1]?.split("?")[0]
                : post.media_url.split("v=")[1]?.split("&")[0];
              return <iframe src={`https://www.youtube.com/embed/${ytId || ""}`} style={{ width: "100%", height: 260, borderRadius: 10, border: "none" }} allowFullScreen />;
            }
            if (t === "video") return <video src={post.media_url} controls style={{ width: "100%", maxHeight: 320, borderRadius: 10, border: `1px solid ${border}` }} />;
            if (t === "audio") return <AudioPostPlayer post={post} border={border} bg2={bg2} text={text} textMuted={textMuted} />;
            if (t === "pdf") return (
              <a href={post.media_url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: text, background: bg2, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 16px", textDecoration: "none" }}>
                <span style={{ fontSize: 16 }}>↗</span> view PDF
              </a>
            );
            return <img className="feed-image-desktop" src={post.media_url} alt="" style={{ width: "100%", maxHeight: 400, objectFit: "cover", borderRadius: 10, border: `1px solid ${border}`, display: "block" }} onError={e => e.target.style.display = "none"} />;
          })()}
        </div>
      )}
      {driveUrl && (
        <div style={{ paddingLeft: 52, marginBottom: 14 }}>
          <GoogleDriveCard url={driveUrl} border={border} bg2={bg2} text={text} textMuted={textMuted} />
        </div>
      )}

      {/* Project tag */}
      {post.project_title && (
        <div style={{ paddingLeft: 52, marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: textMuted, background: bg2, border: `1px solid ${border}`, borderRadius: 20, padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 9, opacity: 0.6 }}>↗</span> {post.project_title}
          </span>
        </div>
      )}

      {/* Actions */}
      <div style={{ paddingLeft: 52, display: "flex", gap: 20, alignItems: "center" }}>
        <button
          className="hb"
          onClick={() => handleLike(post.id)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 13,
            color: isLiked ? text : textMuted,
            display: "flex",
            gap: 6,
            alignItems: "center",
            transition: "color 0.15s, transform 0.15s",
            fontWeight: isLiked ? 500 : 400,
            transform: isLiked ? "scale(1.04)" : "scale(1)",
            opacity: isLikePending ? 0.7 : 1,
            animation: isLikePending ? "feedPulse 260ms ease-out" : "none",
          }}
        >
          {isLiked ? "♥" : "♡"}
          {(post.like_count || 0) > 0 && <span style={{ fontSize: 12 }}>{post.like_count}</span>}
        </button>
        <button
          className="hb"
          onClick={() => { setExpandedComments(prev => ({ ...prev, [post.id]: !prev[post.id] })); if (!postComments[post.id]) loadComments(post.id); }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            color: isOpen ? text : textMuted,
            display: "flex",
            gap: 6,
            alignItems: "center",
            transition: "color 0.15s",
            animation: commentPulseIds.includes(post.id) ? "feedPulse 260ms ease-out" : "none",
          }}
        >
          ◎ {comments.length > 0 ? <span>{comments.length}</span> : <span>{isOpen ? "hide" : "comment"}</span>}
        </button>
      </div>

      {/* Comments */}
      {isOpen && (
        <div style={{ paddingLeft: 52, marginTop: 16 }}>
          {comments.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
              {comments.map((c) => {
                const cUser = users.find(u => u.id === c.user_id);
                const isMyComment = c.user_id === authUser?.id;
                return (
                  <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <Avatar initials={c.user_initials} size={26} dark={dark} />
                    <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 10, padding: "8px 13px", flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <button onClick={() => cUser && setViewingProfile(cUser)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 11, fontWeight: 500, color: text, fontFamily: "inherit" }}>{c.user_name}</button>
                        {isMyComment && <button className="hb" onClick={() => handleDeleteComment(c.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit", opacity: 0.6 }}>✕</button>}
                      </div>
                      <div style={{ fontSize: 13, color: textMuted, lineHeight: 1.6 }}>{c.content}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Avatar initials={myInitials} size={26} dark={dark} />
            <input
              placeholder="write a comment..."
              value={localComment}
              onChange={e => setLocalComment(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submitComment(); } }}
              style={{ ...inputStyle, fontSize: 12, padding: "8px 13px", flex: 1, borderRadius: 20 }}
            />
            {localComment.trim() && (
              <button className="hb" onClick={submitComment} style={{ ...btnP, padding: "8px 14px", fontSize: 11, flexShrink: 0, borderRadius: 20, opacity: isCommentPending ? 0.75 : 1 }}>
                {isCommentPending ? "posting..." : "post"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// @mention input component
function MentionInput({ value, onChange, onKeyDown, placeholder, users, style, rows, dark }) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [mentionStart, setMentionStart] = useState(-1);
  const ref = useRef(null);

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    const cursor = e.target.selectionStart;
    const textBefore = val.slice(0, cursor);
    const atIndex = textBefore.lastIndexOf("@");
    if (atIndex !== -1 && (atIndex === 0 || textBefore[atIndex - 1] === " ")) {
      const query = textBefore.slice(atIndex + 1).toLowerCase();
      const matches = users.filter(u => u.name.toLowerCase().includes(query)).slice(0, 4);
      setSuggestions(matches);
      setShowSuggestions(matches.length > 0);
      setMentionStart(atIndex);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectUser = (user) => {
    const before = value.slice(0, mentionStart);
    const after = value.slice(ref.current.selectionStart);
    onChange(`${before}@${user.name} ${after}`);
    setShowSuggestions(false);
    ref.current.focus();
  };

  const Tag = rows ? "textarea" : "input";
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <Tag ref={ref} value={value} onChange={handleChange} onKeyDown={e => { if (e.key === "Escape") setShowSuggestions(false); if (onKeyDown) onKeyDown(e); }} placeholder={placeholder} rows={rows} style={{ ...style, resize: rows ? "none" : undefined }} />
      {showSuggestions && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: dark ? "#111" : "#fff", border: `1px solid ${dark ? "#222" : "#e0e0e0"}`, borderRadius: 8, zIndex: 100, overflow: "hidden", marginTop: 4 }}>
          {suggestions.map(u => (
            <button key={u.id} onClick={() => selectUser(u)} style={{ width: "100%", padding: "8px 12px", background: "none", border: "none", color: dark ? "#fff" : "#000", cursor: "pointer", textAlign: "left", fontSize: 12, fontFamily: "inherit", display: "flex", gap: 8, alignItems: "center" }}
              onMouseEnter={e => e.currentTarget.style.background = dark ? "#1a1a1a" : "#f0f0f0"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
              <Avatar initials={initials(u.name)} size={24} dark={dark} />
              <div><div style={{ fontSize: 12, color: dark ? "#fff" : "#000" }}>{u.name}</div><div style={{ fontSize: 10, color: dark ? "#555" : "#aaa" }}>{u.role}</div></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BannerEditor({ pixels, onSave, onClose, dark, bg, border, text, textMuted }) {
  const [grid, setGrid] = React.useState([...pixels]);
  const [drawing, setDrawing] = React.useState(false);
  const [drawMode, setDrawMode] = React.useState(1); // 1 = fill, 0 = erase
  const [activePreset, setActivePreset] = React.useState(null);

  const toggle = (i, mode) => {
    setGrid(prev => { const n = [...prev]; n[i] = mode; return n; });
  };

  const applyPreset = (name) => {
    setGrid([...PRESETS[name]]);
    setActivePreset(name);
  };

  const cellSize = Math.floor(Math.min(600, window.innerWidth - 80) / COLS);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.95)" : "rgba(200,200,200,0.9)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(12px)", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: 24, width: "100%", maxWidth: 680, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 4 }}>PROFILE BANNER</div>
            <div style={{ fontSize: 14, color: text }}>design your 8-bit banner</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>✕</button>
        </div>

        {/* Preview */}
        <div style={{ marginBottom: 16, border: `1px solid ${border}`, borderRadius: 8, overflow: "hidden", background: dark ? "#000" : "#fff" }}>
          <PixelBannerDisplay pixels={grid} dark={dark} height={60} />
        </div>

        {/* Presets */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 8 }}>PRESETS</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.keys(PRESETS).map(name => (
              <button key={name} onClick={() => applyPreset(name)} style={{ padding: "4px 12px", borderRadius: 4, fontSize: 11, cursor: "pointer", fontFamily: "inherit", background: activePreset === name ? text : "none", color: activePreset === name ? bg : textMuted, border: `1px solid ${activePreset === name ? text : border}`, transition: "all 0.15s" }}>
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Draw mode */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px" }}>TOOL</div>
          <button onClick={() => setDrawMode(1)} style={{ padding: "3px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer", fontFamily: "inherit", background: drawMode === 1 ? text : "none", color: drawMode === 1 ? bg : textMuted, border: `1px solid ${drawMode === 1 ? text : border}` }}>draw</button>
          <button onClick={() => setDrawMode(0)} style={{ padding: "3px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer", fontFamily: "inherit", background: drawMode === 0 ? text : "none", color: drawMode === 0 ? bg : textMuted, border: `1px solid ${drawMode === 0 ? text : border}` }}>erase</button>
          <button onClick={() => { setGrid(new Array(COLS * ROWS).fill(0)); setActivePreset(null); }} style={{ padding: "3px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer", fontFamily: "inherit", background: "none", color: textMuted, border: `1px solid ${border}`, marginLeft: "auto" }}>clear</button>
        </div>

        {/* Grid */}
        <div
          style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, ${cellSize}px)`, gap: 0, userSelect: "none", border: `1px solid ${border}`, borderRadius: 6, overflow: "hidden", cursor: "crosshair" }}
          onMouseLeave={() => setDrawing(false)}
        >
          {grid.map((v, i) => (
            <div
              key={i}
              style={{ width: cellSize, height: Math.max(6, cellSize * 0.75), background: v ? (dark ? "#fff" : "#000") : (dark ? "#111" : "#f5f5f5"), borderRight: `0.5px solid ${dark ? "#1a1a1a" : "#e8e8e8"}`, borderBottom: `0.5px solid ${dark ? "#1a1a1a" : "#e8e8e8"}`, boxSizing: "border-box" }}
              onMouseDown={() => { setDrawing(true); toggle(i, drawMode); }}
              onMouseEnter={() => { if (drawing) toggle(i, drawMode); }}
              onMouseUp={() => setDrawing(false)}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "11px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: textMuted }}>cancel</button>
          <button onClick={() => { onSave(grid); onClose(); }} style={{ flex: 2, background: text, color: bg, border: "none", borderRadius: 8, padding: "11px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>save banner →</button>
        </div>
      </div>
    </div>
  );
}

function FullProfilePortfolio({ userId, bg2, border, text, textMuted }) {
  const [items, setItems] = React.useState([]);
  const [loaded, setLoaded] = React.useState(false);
  React.useEffect(() => {
    supabase.from("portfolio_items").select("*").eq("user_id", userId).then(({ data }) => { setItems(data || []); setLoaded(true); });
  }, [userId]);
  if (!loaded) return <div style={{ fontSize: 12, color: textMuted }}>loading...</div>;
  if (items.length === 0) return <div style={{ fontSize: 12, color: textMuted }}>no portfolio items yet.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {items.map((item, i) => (
        <div key={item.id} style={{ background: bg2, borderRadius: i === 0 && items.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === items.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < items.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 18px" }}>
          <div style={{ fontSize: 14, color: text, marginBottom: 4 }}>{item.title}</div>
          {item.description && <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.65, marginBottom: 6 }}>{item.description}</div>}
          {item.url && getMediaType(item.url) === "image" && <img src={item.url} alt={item.title} style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 8, border: `1px solid ${border}`, marginTop: 6 }} />}
          {item.url && getMediaType(item.url) === "youtube" && (
            <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${border}`, marginTop: 6 }}>
              <iframe title={item.title} src={`https://www.youtube.com/embed/${getYouTubeId(item.url) || ""}`} style={{ width: "100%", height: 240, border: "none" }} allowFullScreen />
            </div>
          )}
          {item.url && getMediaType(item.url) === "link" && (
            <a href={item.url} target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "10px 12px", marginTop: 6 }}>
              <div style={{ fontSize: 10, color: textMuted, marginBottom: 3 }}>{toHost(item.url)}</div>
              <div style={{ fontSize: 11, color: text, textDecoration: "underline", wordBreak: "break-all" }}>{item.url.includes("user-uploads") ? "view file" : item.url}</div>
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

// ── PUBLIC PROJECT PAGE ──
function CoLab() {
  const [dark, setDark] = useState(true);
  const [screen, setScreen] = useState("landing");
  const [appScreen, setAppScreen] = useState("explore");
  const [exploreTab, setExploreTab] = useState("for-you");
  const [networkTab, setNetworkTab] = useState("feed");
  const [activeProject, setActiveProject] = useState(null);
  const [viewingProfile, setViewingProfileState] = useState(null);
  const [viewFullProfile, setViewFullProfileState] = useState(null);
  const [projectTab, setProjectTab] = useState("tasks");

  // Auth
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [onboardStep, setOnboardStep] = useState(0);
  const [onboardData, setOnboardData] = useState({ name: "", username: "", role: "", bio: "", skills: [] });

  // Data
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [messages, setMessages] = useState([]);
  const [projectUpdates, setProjectUpdates] = useState([]);
  const [applications, setApplications] = useState([]);
  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [dmThreads, setDmThreads] = useState([]);
  const [dmMessages, setDmMessages] = useState({});
  const [activeDmThread, setActiveDmThread] = useState(null);
  const [portfolioItems, setPortfolioItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [liveStats, setLiveStats] = useState({ builders: "...", projects: "..." });
  const [globalSearch, setGlobalSearch] = useState("");
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [posts, setPosts] = useState([]);
  const [postLikes, setPostLikes] = useState({ myLikes: [] });
  const [postComments, setPostComments] = useState({});
  const [pendingLikeIds, setPendingLikeIds] = useState([]);
  const [pendingCommentByPost, setPendingCommentByPost] = useState({});
  const [commentPulseIds, setCommentPulseIds] = useState([]);
  const [recentActivityByPost, setRecentActivityByPost] = useState({});
  const [pendingFeedPosts, setPendingFeedPosts] = useState([]);
  const [justInsertedPostIds, setJustInsertedPostIds] = useState([]);
  const [newPostContent, setNewPostContent] = useState("");
  const [newPostProject, setNewPostProject] = useState("");
  const [newPostMediaUrl, setNewPostMediaUrl] = useState("");
  const [newPostMediaType, setNewPostMediaType] = useState(""); // image|video|audio|youtube|pdf
  const [expandedComments, setExpandedComments] = useState({});
  const [projectFiles, setProjectFiles] = useState([]);
  const [projectDocs, setProjectDocs] = useState([]);
  const [activeDoc, setActiveDoc] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null); // { id, text, type }
  const [editMessageText, setEditMessageText] = useState("");
  const [mentionNotifications, setMentionNotifications] = useState([]);
  const [trendingProjects, setTrendingProjects] = useState([]);
  const [skillCategoryCount, setSkillCategoryCount] = useState(48);

  // UI
  const [showNotifications, setShowNotifications] = useState(false);
  const [filterSkill, setFilterSkill] = useState(null);
  const [networkFilter, setNetworkFilter] = useState(null);
  const [regionFilter, setRegionFilter] = useState(null); // local, national, international
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newProject, setNewProject] = useState({ title: "", description: "", category: CATEGORIES[0], skills: [], maxCollaborators: 2, location: "", goals: "", timeline: "", is_private: false });
  const [createProjectError, setCreateProjectError] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newTaskText, setNewTaskText] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newUpdate, setNewUpdate] = useState("");
  const [dmInput, setDmInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsEmail, setSettingsEmail] = useState("");
  const [settingsNewPassword, setSettingsNewPassword] = useState("");
  const [projectActivity, setProjectActivity] = useState([]);
  const [docPreviewMode, setDocPreviewMode] = useState(false);
  const [inviteLink, setInviteLink] = useState(null);
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [showShipModal, setShowShipModal] = useState(false);
  const [shipPostContent, setShipPostContent] = useState("");
  const [githubCommits, setGithubCommits] = useState([]);
  const [githubRepoInput, setGithubRepoInput] = useState("");
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState(null);
  const [editProfile, setEditProfile] = useState(false);
  const [showBannerEditor, setShowBannerEditor] = useState(false);
  const [bannerPixels, setBannerPixels] = useState(new Array(48 * 12).fill(0));
  const [showApplicationForm, setShowApplicationForm] = useState(null);
  const [showNewDm, setShowNewDm] = useState(false);
  const [newDmSearch, setNewDmSearch] = useState("");
  const [showAddPortfolio, setShowAddPortfolio] = useState(false);
  const [newPortfolioItem, setNewPortfolioItem] = useState({ title: "", description: "", url: "" });
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");
  const [taskEditorTaskId, setTaskEditorTaskId] = useState(null);
  const [taskEditorDraft, setTaskEditorDraft] = useState({ assigneeId: "", dueDate: "", description: "" });
  const [taskUpdatePendingById, setTaskUpdatePendingById] = useState({});
  const [hideFirstTimeGuide, setHideFirstTimeGuide] = useState(false);
  const [projectLastReadAt, setProjectLastReadAt] = useState({});
  const messagesEndRef = useRef(null);
  const dmEndRef = useRef(null);
  const taskMutationSeqRef = useRef({});

  const bg = dark ? "#0a0a0a" : "#ffffff";
  const bg2 = dark ? "#111111" : "#f5f5f5";
  const bg3 = dark ? "#1a1a1a" : "#ebebeb";
  const border = dark ? "#1e1e1e" : "#e0e0e0";
  const text = dark ? "#ffffff" : "#000000";
  const textMuted = dark ? "#555555" : "#aaaaaa";
  const textSub = dark ? "#2a2a2a" : "#d0d0d0";

  const inputStyle = { background: bg2, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 14px", color: text, fontSize: 13, width: "100%", fontFamily: "inherit", outline: "none" };
  const labelStyle = { fontSize: 10, fontWeight: 500, color: textMuted, display: "block", marginBottom: 6, letterSpacing: "0.8px" };
  const btnP = { background: text, color: bg, border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
  const btnG = { background: "none", color: textMuted, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 20px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const openUserProfile = async (user, event) => {
    event?.stopPropagation?.();
    if (!user) return;
    let username = (user.username || "").trim();
    if (!username && user.id) {
      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();
      username = (data?.username || "").trim();
    }
    if (!username) {
      if (user.id) {
        window.location.assign(`/profile/id/${user.id}`);
      } else {
        showToast("This user has no public profile yet.");
      }
      return;
    }
    window.location.assign(`/profile/${encodeURIComponent(username)}`);
  };
  const setViewingProfile = (user) => {
    setViewingProfileState(user || null);
  };
  const setViewFullProfile = (user) => {
    setViewFullProfileState(user || null);
  };
  const markRecentActivity = (postId) => {
    setRecentActivityByPost((prev) => ({ ...prev, [postId]: true }));
    setTimeout(() => {
      setRecentActivityByPost((prev) => {
        if (!prev[postId]) return prev;
        const next = { ...prev };
        delete next[postId];
        return next;
      });
    }, 90000);
  };
  const markCommentPending = (postId, delta) => {
    setPendingCommentByPost((prev) => {
      const nextCount = Math.max(0, (prev[postId] || 0) + delta);
      const next = { ...prev, [postId]: nextCount };
      if (nextCount === 0) delete next[postId];
      return next;
    });
    if (delta > 0) {
      setCommentPulseIds((prev) => (prev.includes(postId) ? prev : [...prev, postId]));
      setTimeout(() => setCommentPulseIds((prev) => prev.filter((id) => id !== postId)), 280);
    }
  };
  const registerInsertedPost = (postId) => {
    setJustInsertedPostIds((prev) => (prev.includes(postId) ? prev : [...prev, postId]));
    setTimeout(() => setJustInsertedPostIds((prev) => prev.filter((id) => id !== postId)), 350);
  };
  const myInitials = initials(profile?.name, "ME");
  const getMatchScore = (p) => (profile?.skills || []).filter(s => (p.skills || []).includes(s)).length;
  const unreadDms = dmThreads.filter(t => t.unread && t.id !== activeDmThread?.id).length;
  const unreadNotifs = notifications.filter(n => !n.read).length + mentionNotifications.length;
  const acceptedProjectApplicants = useMemo(() => (
    activeProject
      ? applications.filter((a) => a.project_id === activeProject.id && a.status === "accepted")
      : []
  ), [activeProject, applications]);
  const usersById = useMemo(() => users.reduce((acc, user) => {
    acc[user.id] = user;
    return acc;
  }, {}), [users]);

  const projectMemberMap = useMemo(() => {
    if (!activeProject) return {};
    const memberIds = [activeProject.owner_id, ...acceptedProjectApplicants.map((a) => a.applicant_id)].filter(Boolean);
    return Array.from(new Set(memberIds)).reduce((acc, memberId) => {
      const member = usersById[memberId];
      if (member) acc[member.id] = member;
      return acc;
    }, {});
  }, [activeProject, acceptedProjectApplicants, usersById]);

  const projectMembers = useMemo(() => {
    if (!activeProject) return [];
    return Object.values(projectMemberMap);
  }, [activeProject, projectMemberMap]);

  const hasTaskDescriptionField = useMemo(() => {
    if (!activeProject) return false;
    return tasks.some((task) => task.project_id === activeProject.id && Object.prototype.hasOwnProperty.call(task, "description"));
  }, [activeProject, tasks]);

  const taskOwnerSummary = useMemo(() => {
    if (!activeProject) return { unassigned: 0, assignedToMe: 0 };
    const openTasks = tasks.filter((t) => t.project_id === activeProject.id && !t.done);
    const unassigned = openTasks.filter((task) => resolveTaskOwnership(task, projectMemberMap, authUser?.id).isUnassigned).length;
    const assignedToMe = openTasks.filter((task) => resolveTaskOwnership(task, projectMemberMap, authUser?.id).isAssignedToMe).length;
    return { unassigned, assignedToMe };
  }, [activeProject, authUser?.id, tasks, projectMemberMap]);

  const projectTasksById = useMemo(() => tasks.reduce((acc, task) => {
    if (!acc[task.project_id]) acc[task.project_id] = [];
    acc[task.project_id].push(task);
    return acc;
  }, {}), [tasks]);

  const projectHealthById = useMemo(() => {
    return projects.reduce((acc, project) => {
      acc[project.id] = computeProjectHealth(project, projectTasksById[project.id] || [], {
        currentUserId: authUser?.id,
        activityTimestamps: [project.updated_at],
      });
      return acc;
    }, {});
  }, [projects, projectTasksById, authUser?.id]);

  const updateTaskOptimistic = async (taskId, updates) => {
    const previousTask = tasks.find((task) => task.id === taskId);
    if (!previousTask) return;
    const mutationSeq = (taskMutationSeqRef.current[taskId] || 0) + 1;
    taskMutationSeqRef.current[taskId] = mutationSeq;
    setTaskUpdatePendingById((prev) => ({ ...prev, [taskId]: true }));
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, ...updates } : task)));
    const { data, error } = await supabase.from("tasks").update(updates).eq("id", taskId).select().single();
    if (taskMutationSeqRef.current[taskId] !== mutationSeq) return;
    if (error || !data) {
      setTasks((prev) => prev.map((task) => (task.id === taskId ? previousTask : task)));
      showToast("Task update failed. Changes rolled back.");
    } else {
      setTasks((prev) => prev.map((task) => (task.id === taskId ? data : task)));
    }
    setTaskUpdatePendingById((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const openTaskEditor = (task) => {
    if (!task) return;
    setTaskEditorTaskId(task.id);
    setTaskEditorDraft({
      assigneeId: task.assigned_to || "",
      dueDate: task.due_date || "",
      description: task.description || "",
    });
  };

  // Render mentions with highlights
  const renderWithMentions = (text) => {
    if (!text) return text;
    const parts = text.split(/(@\w[\w\s]*)/g);
    return parts.map((part, i) =>
      part.startsWith("@")
        ? <span key={i} style={{ color: dark ? "#fff" : "#000", fontWeight: 600 }}>{part}</span>
        : part
    );
  };
  const renderMessageBody = (msgText, isMe, compact = false) => {
    const lines = (msgText || "").split("\n");
    const maybeUrl = lines[lines.length - 1]?.trim();
    const hasSingleUrl = /^https?:\/\//i.test(maybeUrl);
    const isImage = hasSingleUrl && maybeUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i);
    const bodyText = hasSingleUrl ? lines.slice(0, -1).join("\n").trim() : msgText;
    return (
      <div>
        {bodyText && (
          <div style={{ whiteSpace: "pre-wrap" }}>
            {compact ? bodyText : renderWithMentions(bodyText)}
          </div>
        )}
        {hasSingleUrl && (
          isImage
            ? <img src={maybeUrl} alt={bodyText || "attachment"} style={{ width: "100%", maxHeight: 240, objectFit: "cover", borderRadius: 8, marginTop: bodyText ? 8 : 0 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            : <a href={maybeUrl} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline", fontSize: 11, display: "inline-block", marginTop: bodyText ? 6 : 0 }}>open attachment</a>
        )}
      </div>
    );
  };

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { width: 100%; min-height: 100vh; margin: 0; padding: 0; overflow-x: hidden; background-color: ${dark ? "#0a0a0a" : "#ffffff"}; transition: background-color 0.3s ease, color 0.3s ease; }
    body { background: ${dark ? "#0a0a0a" : "#ffffff"}; }
    input, select, textarea { outline: none; font-family: inherit; }
    ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: #2a2a2a; }
    @keyframes fu { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .fu { animation: fu 0.3s ease forwards; opacity: 0; }
    @keyframes tin { from { opacity: 0; transform: translateX(-50%) translateY(6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
    @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    .hb:hover { opacity: 0.7; cursor: pointer; }
    .card-h:hover { border-color: ${text} !important; }
    .task-row:hover .tdel { opacity: 1 !important; }
    @media (min-width: 641px) {
      .feed-image-desktop {
        max-width: 620px !important;
        max-height: 340px !important;
      }
    }
    @media (max-width: 640px) {
      .search-desktop { display: none !important; }
      .search-mobile { display: block !important; }
      .hero-h1 { font-size: 44px !important; letter-spacing: -2px !important; }
      .stat-grid { flex-direction: column !important; }
      .stat-item { border-right: none !important; border-bottom: 1px solid ${border} !important; padding: 16px 20px !important; }
      .how-grid { grid-template-columns: 1fr !important; }
      .how-card { border-right: 1px solid ${border} !important; border-bottom: none !important; }
      .how-card:last-child { border-bottom: 1px solid ${border} !important; }
      .pad { padding-left: 16px !important; padding-right: 16px !important; }
      .network-grid { grid-template-columns: 1fr !important; }
      .notif-w { width: calc(100vw - 24px) !important; right: 12px !important; }
      .proj-tabs { overflow-x: auto !important; }
      .profile-layout { grid-template-columns: 1fr !important; }
      .msg-layout { grid-template-columns: 1fr !important; }
      input, select, textarea { font-size: 16px !important; }
      .msgs-left { width: 100% !important; border-right: none !important; }
      .msgs-right { width: 100% !important; }
      .msgs-has-thread .msgs-left { display: none !important; }
      .msgs-no-thread .msgs-right { display: none !important; }
      .msgs-back { display: flex !important; }
      .profile-identity-banner { flex-direction: column-reverse !important; gap: 14px !important; margin-bottom: 24px !important; }
      .profile-identity-row { margin-bottom: 0 !important; align-items: flex-start !important; }
      .profile-banner-shell { width: 100% !important; }
      .profile-banner-card { min-height: 120px !important; }
      .profile-banner-canvas { height: 120px !important; }
    }
      .nav-label { font-size: 10px !important; padding: 4px 4px !important; }
      .hero-h1 { font-size: 44px !important; letter-spacing: -2px !important; }
      .stat-grid { flex-direction: column !important; }
      .stat-item { border-right: none !important; border-bottom: 1px solid ${border} !important; padding: 16px 20px !important; }
      .how-grid { grid-template-columns: 1fr !important; }
      .how-card { border-right: 1px solid ${border} !important; border-bottom: none !important; }
      .how-card:last-child { border-bottom: 1px solid ${border} !important; }
      .pad { padding-left: 16px !important; padding-right: 16px !important; }
      .network-grid { grid-template-columns: 1fr !important; }
      .notif-w { width: calc(100vw - 24px) !important; right: 12px !important; }
      .proj-tabs { overflow-x: auto !important; }
      .profile-layout { grid-template-columns: 1fr !important; }
      .msg-layout { grid-template-columns: 1fr !important; }
    }
  `;

  // Force body background + mobile browser chrome color on mode switch
  useEffect(() => {
    const color = dark ? "#0a0a0a" : "#ffffff";
    document.body.style.backgroundColor = color;
    document.body.style.transition = "background-color 0.3s ease";
    document.documentElement.style.backgroundColor = color;
    document.documentElement.style.transition = "background-color 0.3s ease";
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = color;
  }, [dark]);
  const { loadAllData } = useAppDataBootstrap({
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
    setMentionNotifications,
    setTrendingProjects,
    setSkillCategoryCount,
    setLiveStats,
    setNotifications,
    setShowApplicationForm,
  });


  useAuthBootstrap({
    setAuthUser,
    setProfile,
    setBannerPixels,
    setScreen,
    setAuthLoading,
    loadAllData,
  });

  useEffect(() => {
    setShowInvitePanel(false);
    setInviteLink(null);
    setInviteError("");
    setInviteLoading(false);
  }, [activeProject?.id]);


  useRealtimeSubscriptions({
    authUser,
    activeProject,
    activeDmThread,
    projects,
    messagesEndRef,
    dmEndRef,
    setMessages,
    setDmMessages,
    setDmThreads,
    setApplications,
    setNotifications,
    setProjects,
    setPosts,
    onIncomingPost: (incomingPost) => {
      setPendingFeedPosts((prev) => {
        if (prev.find((p) => p.id === incomingPost.id)) return prev;
        return [incomingPost, ...prev].slice(0, 25);
      });
      markRecentActivity(incomingPost.id);
    },
    setMentionNotifications,
  });


  // ── AUTH ──
  const handleSignUp = async () => {
    setAuthError("");
    const { data, error } = await signUp({ email: authEmail, password: authPassword });
    if (error) { setAuthError(error.message); return; }
    if (data.user) { setAuthUser(data.user); setScreen("onboard"); }
  };

  const handleLogin = async () => {
    setAuthError("");
    const { error } = await signIn({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
  };

  const handlePasswordReset = async () => {
    if (!authEmail) { setAuthError("Enter your email first."); return; }
    const { error } = await resetPassword({ email: authEmail, redirectTo: `${window.location.origin}/reset-password` });
    if (error) setAuthError(error.message);
    else setResetSent(true);
  };

  const handleSignOut = async () => {
    await signOut();
    setProfile(null); setProjects([]); setUsers([]); setFollowing([]);
    setScreen("landing");
  };

  const handleFinishOnboard = async () => {
    if (!onboardData.name) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id || authUser?.id;
      if (!userId) { showToast("Session expired."); setScreen("auth"); return; }
      const { data, error } = await supabase.from("profiles").upsert({
        id: userId, name: onboardData.name, username: onboardData.username || onboardData.name.toLowerCase().replace(/\s+/g, ""), role: onboardData.role || "",
        bio: onboardData.bio || "", skills: onboardData.skills || [],
      }, { onConflict: "id" }).select().single();
      if (error) { showToast("Error: " + error.message); return; }
      if (data) { setProfile(data); setScreen("app"); setAppScreen("explore"); loadAllData(userId); showToast(`Welcome, ${data.name.split(" ")[0]}!`); }
    } catch (error) {
      console.error("Finish onboard failed", error);
      showToast("Something went wrong.");
    }
  };

  const {
    handleSaveProfile,
    saveBanner,
    handleAddPortfolioItem,
    handleDeletePortfolioItem,
  } = useProfileState({
    authUser,
    profile,
    portfolioItems,
    newPortfolioItem,
    setProfile,
    setEditProfile,
    setPortfolioItems,
    setNewPortfolioItem,
    setShowAddPortfolio,
    setBannerPixels,
    showToast,
  });

  const handleUpdateEmail = async () => {
    if (!settingsEmail) return;
    const { error } = await supabase.auth.updateUser({ email: settingsEmail });
    if (error) showToast("Error: " + error.message);
    else { showToast("Check your new email to confirm the change."); setSettingsEmail(""); }
  };

  const handleUpdatePassword = async () => {
    if (!settingsNewPassword || settingsNewPassword.length < 8) { showToast("Password must be at least 8 characters."); return; }
    const { error } = await supabase.auth.updateUser({ password: settingsNewPassword });
    if (error) showToast("Error: " + error.message);
    else { showToast("Password updated."); setSettingsNewPassword(""); }
  };

  const handleFollow = async (userId) => {
    if (following.includes(userId)) {
      await supabase.from("follows").delete().eq("follower_id", authUser.id).eq("following_id", userId);
      setFollowing(prev => prev.filter(id => id !== userId));
      showToast("Unfollowed.");
    } else {
      await supabase.from("follows").insert({ follower_id: authUser.id, following_id: userId });
      setFollowing(prev => [...prev, userId]);
      showToast("Following!");
    }
  };

  const myProjects = projects.filter(p => p.owner_id === authUser?.id && !p.archived);

  // Derive collaborators from accepted applications (both directions)
  const getCollaborators = (userId) => {
    const asApplicant = applications.filter(a => a.applicant_id === userId && a.status === "accepted").map(a => {
      const proj = projects.find(p => p.id === a.project_id);
      const owner = users.find(u => u.id === proj?.owner_id);
      return owner && owner.id !== userId ? { user: owner, project: proj } : null;
    }).filter(Boolean);
    const asOwner = applications.filter(a => {
      const proj = projects.find(p => p.id === a.project_id);
      return proj?.owner_id === userId && a.status === "accepted";
    }).map(a => {
      const collaborator = users.find(u => u.id === a.applicant_id);
      const proj = projects.find(p => p.id === a.project_id);
      return collaborator ? { user: collaborator, project: proj } : null;
    }).filter(Boolean);
    const seen = new Set();
    return [...asApplicant, ...asOwner].filter(c => {
      if (seen.has(c.user.id)) return false;
      seen.add(c.user.id);
      return true;
    });
  };

  const myCollaborators = getCollaborators(authUser?.id);
  const hasCollaborations = applications.some((a) => {
    if (a.status !== "accepted") return false;
    const proj = projects.find(p => p.id === a.project_id);
    return a.applicant_id === authUser?.id || proj?.owner_id === authUser?.id;
  });
  const isFirstTimeUser = Boolean(authUser?.id) && myProjects.length === 0 && !hasCollaborations;
  const showFirstTimeGuide = isFirstTimeUser && !hideFirstTimeGuide;
  const [showCollaborators, setShowCollaborators] = useState(null); // userId whose collaborators to show
  const appliedProjectIds = applications.filter(a => a.applicant_id === authUser?.id).map(a => a.project_id);
  const browseBase = projects.filter(p => p.owner_id !== authUser?.id && !p.archived && !p.is_private);
  const forYou = browseBase.map(p => ({ ...p, _s: getMatchScore(p) })).filter(p => p._s > 0).sort((a, b) => b._s - a._s);
  const allP = browseBase.map(p => ({ ...p, _s: getMatchScore(p) })).filter(p =>
    (!filterSkill || (p.skills || []).includes(filterSkill)) &&
    (!search || p.title?.toLowerCase().includes(search.toLowerCase()))
  ).sort((a, b) => b._s - a._s);

  const todayNextUp = useMemo(() => {
    if (!activeProject) return null;

    const projectTasks = tasks.filter((t) => t.project_id === activeProject.id);
    const incompleteTasks = projectTasks.filter((t) => !t.done);
    const remainingCount = incompleteTasks.length;
    const now = new Date();
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const overdueTasks = incompleteTasks
      .filter((t) => t.due_date && new Date(t.due_date) < now)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    const assignedToMeTasks = incompleteTasks
      .filter((t) => resolveTaskOwnership(t, projectMemberMap, authUser?.id).isAssignedToMe)
      .sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date) - new Date(b.due_date);
      });
    const dueTodayTasks = incompleteTasks
      .filter((t) => t.due_date && new Date(t.due_date) <= dayEnd)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    const taskSeen = new Set();
    const focusTasks = [];
    overdueTasks.forEach((t) => {
      if (taskSeen.has(t.id) || focusTasks.length >= 4) return;
      taskSeen.add(t.id);
      focusTasks.push({ id: t.id, text: t.text, dueDate: t.due_date, tone: "overdue", label: "⚠ overdue" });
    });
    assignedToMeTasks.forEach((t) => {
      if (taskSeen.has(t.id) || focusTasks.length >= 4) return;
      taskSeen.add(t.id);
      focusTasks.push({ id: t.id, text: t.text, dueDate: t.due_date, tone: "mine", label: "you own" });
    });
    dueTodayTasks.forEach((t) => {
      if (taskSeen.has(t.id) || focusTasks.length >= 4) return;
      taskSeen.add(t.id);
      focusTasks.push({ id: t.id, text: t.text, dueDate: t.due_date, tone: "today", label: "due soon" });
    });

    const lastReadTs = projectLastReadAt[activeProject.id];
    const unreadMessages = messages.filter((m) => (
      m.project_id === activeProject.id &&
      m.from_user !== authUser?.id &&
      (!lastReadTs || new Date(m.created_at).getTime() > lastReadTs)
    ));
    const unreadProjectMessages = new Set(unreadMessages.map((m) => m.id)).size;
    const projectMentions = mentionNotifications.filter((n) => n.project_id === activeProject.id && !n.read);
    const pendingApplications = applications.filter((a) => a.project_id === activeProject.id && a.status === "pending");

    const lastActivityTimestamp = [projectActivity[0]?.created_at, activeProject.updated_at, messages[messages.length - 1]?.created_at]
      .filter(Boolean)
      .map((ts) => new Date(ts).getTime())
      .sort((a, b) => b - a)[0];
    const noRecentActivity = !lastActivityTimestamp || (Date.now() - lastActivityTimestamp > 72 * 60 * 60 * 1000);
    const isBlocked = remainingCount > 0 && noRecentActivity;
    const progress = projectTasks.length > 0
      ? Math.round(((projectTasks.length - remainingCount) / projectTasks.length) * 100)
      : (activeProject.progress || 0);
    const readyToShip = !activeProject.shipped && remainingCount <= 1 && progress >= 90;

    return {
      overdueTasks,
      assignedToMeTasks,
      dueTodayTasks,
      focusTasks,
      remainingCount,
      unreadProjectMessages,
      mentionCount: projectMentions.length,
      pendingApplicationsCount: pendingApplications.length,
      isBlocked,
      readyToShip,
      hasUrgentSignals: unreadProjectMessages > 0 || projectMentions.length > 0 || (activeProject.owner_id === authUser?.id && pendingApplications.length > 0),
    };
  }, [
    activeProject,
    applications,
    authUser?.id,
    mentionNotifications,
    messages,
    projectActivity,
    projectLastReadAt,
    tasks,
    projectMemberMap,
  ]);

  const collaborationNeeds = useMemo(() => {
    if (!activeProject) return null;

    const toNorm = (value = "") => value.toLowerCase().trim();
    const roleLabelBySkill = {
      Design: "Designer needed",
      Engineering: "Frontend / engineering help needed",
      Marketing: "Marketing help needed",
      Product: "Product support needed",
      Writing: "Writing support needed",
      "AI/ML": "AI/ML support needed",
      Video: "Video collaborator needed",
      Music: "Music collaborator needed",
      Finance: "Finance support needed",
      Sales: "Sales help needed",
      Operations: "Operations support needed",
      Legal: "Legal support needed",
      Data: "Data support needed",
      Photography: "Photography support needed",
      "3D/CAD": "3D/CAD collaborator needed",
      Architecture: "Architecture support needed",
    };

    const explicitNeeds = (activeProject.skills || []).filter(Boolean);
    const ownerProfile = users.find((u) => u.id === activeProject.owner_id);
    const acceptedApplicants = applications.filter((a) => a.project_id === activeProject.id && a.status === "accepted");
    const pendingApplicants = applications.filter((a) => a.project_id === activeProject.id && a.status === "pending");
    const activeProjectTasks = tasks.filter((t) => t.project_id === activeProject.id);
    const openProjectTasks = activeProjectTasks.filter((t) => !t.done);
    const unassignedOpenTasks = openProjectTasks.filter((t) => resolveTaskOwnership(t, projectMemberMap, authUser?.id).isUnassigned).length;

    const existingSkillSignals = new Set(
      [
        ...(ownerProfile?.skills || []),
        ...(acceptedApplicants.flatMap((a) => a.applicant_skills || [])),
        ...(acceptedApplicants.map((a) => a.applicant_role || "")),
      ].map(toNorm).filter(Boolean)
    );

    const explicitMissing = explicitNeeds.filter((skill) => !existingSkillSignals.has(toNorm(skill)));

    const inferenceText = [
      activeProject.title,
      activeProject.description,
      activeProject.goals,
      activeProject.timeline,
      ...openProjectTasks.map((t) => t.text),
      ...projectUpdates.slice(0, 6).map((u) => u.text),
    ].join(" ").toLowerCase();

    const inferenceRules = [
      { skill: "Design", minHits: 2, keywords: ["design", "ui", "ux", "figma", "wireframe", "prototype", "brand"] },
      { skill: "Engineering", minHits: 2, keywords: ["frontend", "backend", "api", "code", "dev", "react", "build", "integration"] },
      { skill: "Marketing", minHits: 2, keywords: ["marketing", "launch", "growth", "campaign", "social", "seo", "community"] },
      { skill: "Product", minHits: 2, keywords: ["product", "roadmap", "scope", "requirements", "prioritize"] },
      { skill: "Writing", minHits: 2, keywords: ["copy", "docs", "documentation", "writing", "content"] },
    ];

    const inferredMissing = inferenceRules
      .filter((rule) => {
        if (explicitNeeds.includes(rule.skill)) return false;
        if (existingSkillSignals.has(toNorm(rule.skill))) return false;
        const hits = rule.keywords.reduce((sum, keyword) => sum + (inferenceText.includes(keyword) ? 1 : 0), 0);
        return hits >= rule.minHits;
      })
      .map((rule) => rule.skill)
      .slice(0, 2);

    const roleNeeds = [...new Set((explicitMissing.length > 0 ? explicitMissing : inferredMissing))]
      .map((skill) => ({ skill, label: roleLabelBySkill[skill] || `${skill} support needed`, inferred: explicitMissing.length === 0 }));

    const maxCollaborators = Math.max(1, activeProject.max_collaborators || 2);
    const collaboratorCoverage = acceptedApplicants.length / maxCollaborators;
    const unfilledCollaboratorNeeds = Math.max(0, maxCollaborators - acceptedApplicants.length);

    const demandSignals = [
      pendingApplicants.length > 0
        ? { key: "pending-apps", label: `${pendingApplicants.length} open application${pendingApplicants.length !== 1 ? "s" : ""}` }
        : null,
      unfilledCollaboratorNeeds > 0
        ? { key: "unfilled-needs", label: `${unfilledCollaboratorNeeds} collaborator slot${unfilledCollaboratorNeeds !== 1 ? "s" : ""} still unfilled` }
        : null,
      collaboratorCoverage < 0.5 && openProjectTasks.length > 0
        ? { key: "low-coverage-active-tasks", label: "Low collaborator coverage while tasks are active" }
        : null,
      unassignedOpenTasks > 0
        ? { key: "unassigned-open-tasks", label: `${unassignedOpenTasks} open task${unassignedOpenTasks !== 1 ? "s" : ""} with no assignee` }
        : null,
    ].filter(Boolean);

    return {
      roleNeeds,
      demandSignals,
      pendingApplicantsCount: pendingApplicants.length,
      hasExplicitNeeds: explicitNeeds.length > 0,
    };
  }, [activeProject, applications, projectUpdates, tasks, users, projectMemberMap, authUser?.id]);

  const TabBtn = ({ id, label, count, setter, current }) => (
    <button onClick={() => setter(id)} style={{ background: "none", border: "none", borderBottom: current === id ? `1px solid ${text}` : "1px solid transparent", color: current === id ? text : textMuted, padding: "8px 0", fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginRight: 20, transition: "all 0.15s", display: "inline-flex", gap: 5, alignItems: "center", whiteSpace: "nowrap" }}>
      {label}{count > 0 && <span style={{ fontSize: 10, background: bg3, borderRadius: 10, padding: "1px 6px", color: textMuted }}>{count}</span>}
    </button>
  );

  useEffect(() => {
    if (!authUser?.id) {
      setHideFirstTimeGuide(false);
      return;
    }
    const dismissed = localStorage.getItem(`onboarding-guide-dismissed:${authUser.id}`) === "true";
    setHideFirstTimeGuide(dismissed);
  }, [authUser?.id]);

  useEffect(() => {
    if (!activeProject?.id) return;
    setProjectLastReadAt((prev) => (prev[activeProject.id] ? prev : { ...prev, [activeProject.id]: Date.now() }));
  }, [activeProject?.id]);

  useEffect(() => {
    if (!activeProject?.id || projectTab !== "messages") return;
    setProjectLastReadAt((prev) => ({ ...prev, [activeProject.id]: Date.now() }));
  }, [activeProject?.id, messages.length, projectTab]);

  const dismissFirstTimeGuide = () => {
    if (authUser?.id) localStorage.setItem(`onboarding-guide-dismissed:${authUser.id}`, "true");
    setHideFirstTimeGuide(true);
  };

  const openCreateProjectFlow = () => {
    setAppScreen("workspace");
    setActiveProject(null);
    setShowCreate(true);
  };

  const openJoinProjectFlow = () => {
    setAppScreen("explore");
    setActiveProject(null);
    setExploreTab("all");
    setTimeout(() => {
      document.getElementById("feed")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const generateInviteForProject = async (projectId) => {
    setInviteError("");
    setInviteLoading(true);
    const result = await handleGenerateInvite(projectId);
    if (!result?.ok) {
      setInviteError(result?.error?.message || "Could not create invite link. Please retry.");
    }
    setInviteLoading(false);
  };

  const openInvitePanel = async (projectId) => {
    setShowInvitePanel(true);
    if (!inviteLink && !inviteLoading) {
      await generateInviteForProject(projectId);
    }
  };

  const renderFirstTimeGuide = () => (
    <div style={{ marginBottom: 24, background: bg2, border: `1px solid ${border}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 6 }}>GET STARTED</div>
          <div style={{ fontSize: 15, color: text, lineHeight: 1.5 }}>Welcome to CoLab. Your first step is to create a project or join one.</div>
        </div>
        <button className="hb" onClick={dismissFirstTimeGuide} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, flexShrink: 0 }}>dismiss</button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="hb" onClick={openCreateProjectFlow} style={btnP}>Create your first project</button>
        <button className="hb" onClick={openJoinProjectFlow} style={btnG}>Find collaborators / join a project</button>
      </div>
    </div>
  );

  const PRow = ({ p }) => {
    const spots = (p.max_collaborators || 2) - (p.collaborators || 0);
    const owner = users.find(u => u.id === p.owner_id);
    return (
      <div style={{ borderBottom: `1px solid ${border}`, padding: "20px 0", display: "grid", gridTemplateColumns: "1fr auto", gap: 12, cursor: "pointer", transition: "opacity 0.15s" }}
        onMouseEnter={e => e.currentTarget.style.opacity = "0.65"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        onClick={() => { setActiveProject(p); loadProjectData(p.id); }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <button onClick={e => { e.stopPropagation(); if (owner) setViewingProfile(owner); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <Avatar initials={p.owner_initials} size={20} dark={dark} />
              <span style={{ fontSize: 11, color: textMuted, textDecoration: "underline" }}>{p.owner_name}</span>
            </button>
            <span style={{ color: textSub }}>·</span>
            <span style={{ fontSize: 11, color: textMuted }}>{new Date(p.created_at).toLocaleDateString()}</span>
            {appliedProjectIds.includes(p.id) && <span style={{ fontSize: 10, color: textMuted, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px" }}>applied</span>}
            {p._s > 0 && <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 3, border: `1px solid ${dark ? "#ffffff20" : "#00000015"}`, color: text }}>{p._s >= 2 ? "★★ strong match" : "★ match"}</span>}
          </div>
          <div style={{ fontSize: 15, color: text, marginBottom: 6, letterSpacing: "-0.3px", lineHeight: 1.3 }}>{p.title}</div>
          <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.65, marginBottom: 10 }}>{(p.description || "").slice(0, 100)}...</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {(p.skills || []).map(s => <span key={s} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, border: `1px solid ${(profile?.skills || []).includes(s) ? (dark ? "#ffffff35" : "#00000025") : border}`, color: (profile?.skills || []).includes(s) ? text : textMuted, fontWeight: (profile?.skills || []).includes(s) ? 500 : 400 }}>{s}</span>)}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {p.shipped && <div style={{ fontSize: 10, color: "#22c55e", marginBottom: 4 }}>shipped</div>}
          <div style={{ fontSize: 11, color: spots > 0 && !p.shipped ? text : textMuted, fontWeight: spots > 0 && !p.shipped ? 500 : 300, marginBottom: 3 }}>{p.shipped ? "complete" : spots > 0 ? `${spots} open` : "full"}</div>
          <div style={{ fontSize: 10, color: textMuted }}>{p.category}</div>
          {p.location && <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>{p.location}</div>}
        </div>
      </div>
    );
  };

  const UserCard = ({ u }) => {
    const sharedSkills = (profile?.skills || []).filter(s => (u.skills || []).includes(s));
    const userProjects = projects.filter(p => p.owner_id === u.id);
    const userCollaborators = getCollaborators(u.id);
    const mutualCollaborators = userCollaborators.filter((c) => myCollaborators.some((mine) => mine.user.id === c.user.id));
    const lastActiveDays = u.updated_at ? Math.floor((Date.now() - new Date(u.updated_at).getTime()) / (1000 * 60 * 60 * 24)) : null;
    const isRecentlyActive = typeof lastActiveDays === "number" && lastActiveDays >= 0 && lastActiveDays <= 7;
    const roleTags = [u.role, ...(u.skills || [])].filter(Boolean).slice(0, 4);
    const safeBio = u.bio ? u.bio.slice(0, 90) : "Open to collaborating on new builds.";
    return (
      <div onClick={() => setViewFullProfile(u)} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 12, padding: "18px 18px 16px", cursor: "pointer", transition: "border 0.2s" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = text} onMouseLeave={e => e.currentTarget.style.borderColor = border}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
          <Avatar initials={initials(u.name)} size={44} dark={dark} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: text, lineHeight: 1.2 }}>{u.name}</div>
              {isRecentlyActive && <span style={{ fontSize: 9, color: textMuted, border: `1px solid ${border}`, borderRadius: 20, padding: "1px 7px" }}>active</span>}
            </div>
            <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{u.role || "Builder"}</div>
            {u.location && <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>{u.location}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, color: textMuted, marginTop: 5 }}>
              <span>{userProjects.length} project{userProjects.length !== 1 ? "s" : ""}</span>
              {mutualCollaborators.length > 0 && <span>· {mutualCollaborators.length} mutual collaborator{mutualCollaborators.length !== 1 ? "s" : ""}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
          {roleTags.map((s) => <span key={s} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, border: `1px solid ${(u.skills || []).includes(s) && sharedSkills.includes(s) ? (dark ? "#ffffff35" : "#00000025") : border}`, color: (u.skills || []).includes(s) && sharedSkills.includes(s) ? text : textMuted }}>{s}</span>)}
        </div>
        <p style={{ fontSize: 12, color: textMuted, lineHeight: 1.65, marginBottom: 8 }}>{safeBio}{u.bio && u.bio.length > 90 ? "..." : ""}</p>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          {sharedSkills.length > 0
            ? <div style={{ fontSize: 10, color: textMuted }}>★ {sharedSkills.length} shared skill{sharedSkills.length !== 1 ? "s" : ""}</div>
            : <div style={{ fontSize: 10, color: textMuted }}>discover profile →</div>}
          {typeof lastActiveDays === "number" && lastActiveDays > 7 && <div style={{ fontSize: 10, color: textMuted }}>active {lastActiveDays}d ago</div>}
        </div>
      </div>
    );
  };

  const ProfileModal = ({ u, onClose }) => {
    const isFollowing = following.includes(u.id);
    const userProjects = projects.filter(p => p.owner_id === u.id);
    const sharedSkills = (profile?.skills || []).filter(s => (u.skills || []).includes(s));
    const uInitials = initials(u.name, "?");
    const [userPortfolio, setUserPortfolio] = useState([]);
    useEffect(() => {
      supabase.from("portfolio_items").select("*").eq("user_id", u.id).then(({ data }) => setUserPortfolio(data || []));
    }, [u.id]);
    return (
      <div style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.88)" : "rgba(220,220,220,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150, backdropFilter: "blur(10px)", padding: 16 }} onClick={onClose}>
        <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "32px 28px", width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", cursor: "pointer" }} onClick={() => { setViewFullProfile(u); onClose(); }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px" }}>PROFILE</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
            <Avatar initials={uInitials} size={52} dark={dark} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 400, color: text, letterSpacing: "-0.5px" }}>{u.name}</div>
              {u.username && <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>@{u.username}</div>}
              <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>{u.role}</div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 20 }}>{u.bio}</p>
          <div style={{ marginBottom: 20 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>SKILLS</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {(u.skills || []).map(s => <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${sharedSkills.includes(s) ? (dark ? "#ffffff40" : "#00000030") : border}`, borderRadius: 3, color: sharedSkills.includes(s) ? text : textMuted, fontWeight: sharedSkills.includes(s) ? 500 : 400 }}>{s}{sharedSkills.includes(s) ? " ★" : ""}</span>)}
            </div>
            {sharedSkills.length > 0 && <div style={{ fontSize: 11, color: textMuted, marginTop: 8 }}>★ {sharedSkills.length} shared skill{sharedSkills.length !== 1 ? "s" : ""} with you</div>}
          </div>
          {userProjects.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>PROJECTS</div>
              {userProjects.map(p => (
                <div key={p.id} style={{ padding: "10px 0", borderBottom: `1px solid ${border}`, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.6"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                  onClick={() => { setActiveProject(p); loadProjectData(p.id); onClose(); setAppScreen("explore"); }}>
                  <div style={{ fontSize: 13, color: text, marginBottom: 5 }}>{p.title}</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {(p.skills || []).map(s => <span key={s} style={{ fontSize: 10, padding: "1px 7px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {userPortfolio.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>PORTFOLIO</div>
              {userPortfolio.map(item => (
                <div key={item.id} style={{ padding: "10px 0", borderBottom: `1px solid ${border}` }}>
                  <div style={{ fontSize: 13, color: text, marginBottom: 3 }}>{item.title}</div>
                  {item.description && <div style={{ fontSize: 12, color: textMuted, marginBottom: 6 }}>{item.description}</div>}
                  {item.url && (
                    item.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                      ? <img src={item.url} alt={item.title} style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 6, border: `1px solid ${border}`, marginTop: 4 }} />
                      : <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: text, textDecoration: "underline" }}>{item.url.includes("user-uploads") ? "view file" : item.url}</a>
                  )}
                </div>
              ))}
            </div>
          )}
          {u.id !== authUser?.id && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={e => { e.stopPropagation(); setViewFullProfile(u); onClose(); }} style={{ ...btnG, width: "100%", textAlign: "center", fontSize: 12, padding: "10px" }}>view full profile →</button>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={e => { e.stopPropagation(); handleFollow(u.id); }} style={{ flex: 1, background: isFollowing ? bg3 : text, color: isFollowing ? textMuted : bg, border: `1px solid ${isFollowing ? border : text}`, borderRadius: 8, padding: "11px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                  {isFollowing ? "following" : "follow"}
                </button>
                <button onClick={e => { e.stopPropagation(); openDm(u); onClose(); }} style={{ flex: 1, background: "none", color: text, border: `1px solid ${border}`, borderRadius: 8, padding: "11px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>message</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderApplicationForm = () => {
    const project = showApplicationForm;
    if (!project) return null;
    const closeForm = () => closeApplicationForm();
    const projectSkills = project.skills || [];
    const otherSkills = SKILLS.filter(s => !projectSkills.includes(s));
    const toggleSkill = (s) => setApplicationForm(f => ({ ...f, skills: f.skills.includes(s) ? f.skills.filter(x => x !== s) : [...f.skills, s] }));
    return (
    <div style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.9)" : "rgba(200,200,200,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(10px)", padding: 16 }} onClick={closeForm}>
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "28px", width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        {applicationSuccess ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 28, marginBottom: 16 }}>✓</div>
            <div style={{ fontSize: 16, color: text, fontWeight: 500, marginBottom: 10 }}>Application sent!</div>
            <div style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 28, maxWidth: 320, margin: "0 auto 28px" }}>
              {project.owner_name ? `${project.owner_name} will` : "The project owner will"} reach out via Messages if they want to move forward.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button className="hb" onClick={() => { closeForm(); setAppScreen("explore"); setActiveProject(null); }} style={{ ...btnP, width: "100%", padding: "12px" }}>browse more projects →</button>
              <button className="hb" onClick={closeForm} style={{ ...btnG, width: "100%" }}>close</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 6 }}>APPLY</div>
                <div style={{ fontSize: 16, color: text, fontWeight: 500 }}>{project.title}</div>
              </div>
              <button onClick={closeForm} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>SKILLS YOU'RE BRINGING</label>
                {projectSkills.length > 0 && (
                  <div style={{ marginBottom: 8, padding: "10px 12px", background: bg2, borderRadius: 6, border: `1px solid ${border}` }}>
                    <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 6 }}>NEEDED FOR THIS PROJECT</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {projectSkills.map(s => { const sel = applicationForm.skills.includes(s); const match = (profile?.skills || []).includes(s); return <button key={s} className="hb" onClick={() => toggleSkill(s)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : match ? text : textMuted, border: `1px solid ${sel ? text : match ? (dark ? "#ffffff45" : "#00000025") : border}`, fontWeight: match ? 500 : 400, transition: "all 0.15s" }}>{s}{match && !sel ? " ★" : ""}</button>; })}
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {otherSkills.map(s => { const sel = applicationForm.skills.includes(s); return <button key={s} className="hb" onClick={() => toggleSkill(s)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                </div>
              </div>
              <div><label style={labelStyle}>AVAILABILITY</label>
                <select style={inputStyle} value={applicationForm.availability} onChange={e => setApplicationForm({ ...applicationForm, availability: e.target.value })}>
                  <option value="">Select availability...</option>
                  {AVAILABILITY.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>WHY DO YOU WANT TO JOIN?</label>
                <textarea style={{ ...inputStyle, resize: "none" }} rows={4} placeholder="Tell the project owner why you're a great fit..." value={applicationForm.motivation} onChange={e => setApplicationForm({ ...applicationForm, motivation: e.target.value })} />
              </div>
              <div><label style={labelStyle}>PORTFOLIO / LINK (optional)</label>
                <input style={inputStyle} placeholder="https://..." value={applicationForm.portfolio_url} onChange={e => setApplicationForm({ ...applicationForm, portfolio_url: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="hb" onClick={closeForm} style={btnG}>cancel</button>
              <button className="hb" onClick={handleApply} disabled={!applicationForm.motivation || !applicationForm.availability} style={{ ...btnP, flex: 1, opacity: (!applicationForm.motivation || !applicationForm.availability) ? 0.4 : 1 }}>submit application →</button>
            </div>
          </>
        )}
      </div>
    </div>
    );
  };

  const ReviewModal = ({ project, onClose }) => {
    const projectApps = getProjectPendingApplications(project.id);
    return (
      <div style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.9)" : "rgba(200,200,200,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(10px)", padding: 16 }} onClick={onClose}>
        <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "28px", width: "100%", maxWidth: 640, maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 6 }}>APPLICANTS</div>
              <div style={{ fontSize: 16, color: text, fontWeight: 500 }}>{project.title}</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>✕</button>
          </div>
          {projectApps.length === 0
            ? <div style={{ fontSize: 13, color: textMuted, padding: "24px 0" }}>no applications yet.</div>
            : !selectedApplicant
              ? <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {projectApps.map(a => (
                    <div key={a.id} onClick={() => setSelectedApplicant(a)} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 10, padding: "14px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "border 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = text} onMouseLeave={e => e.currentTarget.style.borderColor = border}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <Avatar initials={a.applicant_initials} size={36} dark={dark} />
                        <div>
                          <div style={{ fontSize: 13, color: text, fontWeight: 500 }}>{a.applicant_name}</div>
                          <div style={{ fontSize: 11, color: textMuted }}>{a.applicant_role} · {a.availability}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: textMuted }}>view →</div>
                    </div>
                  ))}
                </div>
              : <div>
                  <button onClick={() => setSelectedApplicant(null)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, marginBottom: 20 }}>← all applicants</button>
                  <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
                    <Avatar initials={selectedApplicant.applicant_initials} size={48} dark={dark} />
                    <div>
                      <div style={{ fontSize: 18, color: text }}>{selectedApplicant.applicant_name}</div>
                      <div style={{ fontSize: 12, color: textMuted }}>{selectedApplicant.applicant_role}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                    {selectedApplicant.availability && <div><div style={labelStyle}>AVAILABILITY</div><div style={{ fontSize: 13, color: text }}>{selectedApplicant.availability}</div></div>}
                    {selectedApplicant.motivation && <div><div style={labelStyle}>WHY THEY WANT TO JOIN</div><div style={{ fontSize: 13, color: textMuted, lineHeight: 1.7 }}>{selectedApplicant.motivation}</div></div>}
                    {selectedApplicant.applicant_bio && <div><div style={labelStyle}>BIO</div><div style={{ fontSize: 13, color: textMuted, lineHeight: 1.7 }}>{selectedApplicant.applicant_bio}</div></div>}
                    {selectedApplicant.portfolio_url && <div><div style={labelStyle}>PORTFOLIO</div><a href={selectedApplicant.portfolio_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: text }}>{selectedApplicant.portfolio_url}</a></div>}
                    {(selectedApplicant.applicant_skills || []).length > 0 && <div><div style={labelStyle}>SKILLS</div><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{selectedApplicant.applicant_skills.map(s => <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}</div></div>}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="hb" onClick={handleReviewDecline} style={{ ...btnG, flex: 1 }}>decline</button>
                    <button className="hb" onClick={handleReviewAccept} style={{ ...btnP, flex: 1 }}>accept + message →</button>
                  </div>
                </div>
          }
        </div>
      </div>
    );
  };

  // ── MENTION DETECTION ──
  const detectAndNotifyMentions = async (text, projectId) => {
    const mentioned = text.match(/@(\w[\w\s]*)/g);
    if (!mentioned) return;
    for (const mention of mentioned) {
      const name = mention.slice(1).trim();
      const mentionedUser = users.find(u => u.name.toLowerCase() === name.toLowerCase());
      if (mentionedUser && mentionedUser.id !== authUser?.id) {
        await supabase.from("mention_notifications").insert({
          user_id: mentionedUser.id, from_name: profile.name,
          from_initials: myInitials, context: text.slice(0, 80),
          project_id: projectId, read: false,
        });
      }
    }
  };

  const {
    loadProjectData,
    handlePostProject,
    handleArchiveProject,
    handleUnarchiveProject,
    handleShipProject,
    handleToggleFeatured,
    loadGithubCommits,
    handleSaveGithubRepo,
    handleLeaveProject,
    handleGenerateInvite,
    handleDeleteArchivedProject,
    logActivity,
    handleAddTask,
    handleToggleTask,
    handleDeleteTask,
    handlePostUpdate,
    handleUploadProjectFile,
    handleDeleteProjectFile,
    handleCreateProjectDoc,
    handleDeleteProjectDoc,
    handleSaveProjectDoc,
  } = useProjectWorkspace({
    authUser,
    profile,
    myInitials,
    projects,
    setProjects,
    activeProject,
    setActiveProject,
    setTasks,
    tasks,
    users,
    setMessages,
    setProjectUpdates,
    projectUpdates,
    setProjectFiles,
    setProjectDocs,
    setActiveDoc,
    setProjectActivity,
    setApplications,
    setPosts,
    newProject,
    setNewProject,
    setShowCreate,
    setAppScreen,
    setProjectTab,
    newTaskText,
    setNewTaskText,
    taskAssignee,
    setTaskAssignee,
    taskDueDate,
    setTaskDueDate,
    newUpdate,
    setNewUpdate,
    detectAndNotifyMentions,
    showToast,
    setShowShipModal,
    setShipPostContent,
    setInviteLink,
    setGithubLoading,
    setGithubError,
    setGithubCommits,
    setCreateProjectError,
    setIsCreatingProject,
  });

  const {
    openDmThread,
    openDm,
    handleSendMessage,
    handleSendDm,
    handleDeleteDm,
    handleDeleteThread,
    handleEditDm,
    handleDeleteProjectMessage,
    handleEditProjectMessage,
    dmAttachments,
    projectAttachments,
    addDmAttachments,
    addProjectAttachments,
    retryDmAttachment,
    retryProjectAttachment,
  } = useMessaging({
    authUser,
    profile,
    myInitials,
    users,
    dmThreads,
    dmMessages,
    activeDmThread,
    newMessage,
    setNewMessage,
    dmInput,
    setDmInput,
    messagesEndRef,
    dmEndRef,
    setMessages,
    setDmMessages,
    setDmThreads,
    setActiveDmThread,
    setAppScreen,
    setViewingProfile,
    setViewFullProfile,
    setEditingMessage,
    detectAndNotifyMentions,
    showToast,
  });

  const {
    applicationSuccess,
    setApplicationForm,
    applicationForm,
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
  } = useApplications({
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
  });

  const handleCreatePost = async () => {
    if (!newPostContent.trim()) return;
    const proj = myProjects.find(p => p.id === newPostProject);
    const insertPayload = {
      user_id: authUser.id,
      user_name: profile.name,
      user_initials: myInitials,
      user_role: profile.role || "",
      content: newPostContent,
      project_id: proj?.id || null,
      project_title: proj?.title || null,
      media_url: newPostMediaUrl || null,
      media_type: newPostMediaType || null,
    };
    let { data, error } = await supabase.from("posts").insert(insertPayload).select().single();
    // If media_type column doesn't exist yet, retry without it
    if (error && error.message?.includes("media_type")) {
      delete insertPayload.media_type;
      ({ data, error } = await supabase.from("posts").insert(insertPayload).select().single());
    }
    if (error) { showToast(`Post failed: ${error.message}`); return; }
    if (data) {
      // Attach media_type locally even if not in DB yet
      setPosts((prev) => [{ ...data, media_type: newPostMediaType || null }, ...prev]);
      registerInsertedPost(data.id);
      markRecentActivity(data.id);
      setNewPostContent("");
      setNewPostProject("");
      setNewPostMediaUrl("");
      setNewPostMediaType("");
      showToast("Posted.");
    }
  };

  const handleAssignRole = async (projectId, userId, role) => {
    await supabase.from("project_members").upsert({
      project_id: projectId, user_id: userId, role,
    }, { onConflict: "project_id,user_id" });
    showToast(`Role updated to ${role}.`);
  };

  const handleLike = async (postId) => {
    const myLikes = postLikes.myLikes || [];
    const isLiked = myLikes.includes(postId);
    setPendingLikeIds((prev) => (prev.includes(postId) ? prev : [...prev, postId]));
    markRecentActivity(postId);
    if (isLiked) {
      setPostLikes({ myLikes: myLikes.filter(id => id !== postId) });
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, like_count: Math.max(0, (p.like_count || 0) - 1) } : p));
    } else {
      setPostLikes({ myLikes: [...myLikes, postId] });
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, like_count: (p.like_count || 0) + 1 } : p));
    }
    try {
      if (isLiked) {
        await supabase.from("likes").delete().eq("user_id", authUser.id).eq("post_id", postId);
        await supabase.rpc("decrement_like", { post_id: postId });
      } else {
        await supabase.from("likes").insert({ user_id: authUser.id, post_id: postId });
        await supabase.rpc("increment_like", { post_id: postId });
      }
    } catch {
      // rollback optimistic update
      if (isLiked) {
        setPostLikes({ myLikes: [...(postLikes.myLikes || []), postId] });
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, like_count: (p.like_count || 0) + 1 } : p));
      } else {
        setPostLikes({ myLikes: (postLikes.myLikes || []).filter(id => id !== postId) });
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, like_count: Math.max(0, (p.like_count || 0) - 1) } : p));
      }
      showToast("Like sync failed. Retrying may help.");
    } finally {
      setPendingLikeIds((prev) => prev.filter((id) => id !== postId));
    }
  };

  const loadComments = async (postId) => {
    if (postComments[postId]) return;
    const { data } = await supabase.from("comments").select("*").eq("post_id", postId).order("created_at");
    setPostComments(prev => ({ ...prev, [postId]: data || [] }));
  };

  const handleDeletePost = async (postId) => {
    const post = posts.find(p => p.id === postId);
    if (post?.media_url && post.media_url.includes("user-uploads")) {
      try {
        const pathMatch = post.media_url.match(/user-uploads\/(.+)$/);
        if (pathMatch) await supabase.storage.from("user-uploads").remove([pathMatch[1]]);
      } catch (e) { console.warn("Storage cleanup:", e); }
    }
    await supabase.from("posts").delete().eq("id", postId);
    setPosts(posts.filter(p => p.id !== postId));
    showToast("Post deleted.");
  };

  const revealPendingPosts = () => {
    if (pendingFeedPosts.length === 0) return;
    const incoming = [...pendingFeedPosts];
    setPendingFeedPosts([]);
    setPosts((prev) => {
      const existing = new Set(prev.map((p) => p.id));
      const merged = [...incoming.filter((p) => !existing.has(p.id)), ...prev];
      return merged;
    });
    incoming.forEach((post) => {
      registerInsertedPost(post.id);
      markRecentActivity(post.id);
    });
  };

  const renderNetwork = () => {
    const followingFeed = posts.filter(p => following.includes(p.user_id));
    const allFeed = posts;
    const feedToShow = networkTab === "feed-following" ? followingFeed : allFeed;
    const postCtx = {
      postLikes, expandedComments, postComments, authUser, users,
      handleDeletePost, dark, border, text, textMuted, bg, bg2, btnP, inputStyle,
      setViewingProfile, handleLike, setExpandedComments, loadComments,
      myInitials, setPostComments, profile, supabase,
      pendingLikeIds, commentPulseIds, pendingCommentByPost,
      recentActivityByPost, justInsertedPostIds, markCommentPending, markRecentActivity,
    };

    return (
      <div className="pad fu" style={{ width: "100%", padding: "48px 32px" }}>
        <style>{`
          @keyframes feedPulse { 0% { transform: scale(1); } 45% { transform: scale(1.08); } 100% { transform: scale(1); } }
          @keyframes feedPostAppear { 0% { opacity: 0; transform: translateY(-8px); } 100% { opacity: 1; transform: translateY(0); } }
        `}</style>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 10 }}>NETWORK</div>
          <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 400, letterSpacing: "-1.5px", color: text, marginBottom: 8 }}>Your network.</h2>
          <p style={{ fontSize: 13, color: textMuted }}>See what people are building. Share what you're working on.</p>
        </div>
        {pendingFeedPosts.length > 0 && (networkTab === "feed" || networkTab === "feed-following") && (
          <button className="hb" onClick={revealPendingPosts} style={{ marginBottom: 16, background: bg2, border: `1px solid ${border}`, borderRadius: 999, padding: "8px 14px", color: text, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
            {pendingFeedPosts.length} new {pendingFeedPosts.length === 1 ? "post" : "posts"} · show updates
          </button>
        )}

        {/* Tabs */}
        <div style={{ borderBottom: `1px solid ${border}`, marginBottom: 28, display: "flex" }}>
          {[
            { id: "feed", label: "feed" },
            { id: "feed-following", label: "following", count: followingFeed.length },
            { id: "people", label: "people" },
          ].map(({ id, label, count }) => (
            <button key={id} onClick={() => setNetworkTab(id)} style={{ background: "none", border: "none", borderBottom: networkTab === id ? `1px solid ${text}` : "1px solid transparent", color: networkTab === id ? text : textMuted, padding: "8px 0", fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginRight: 24, transition: "all 0.15s", display: "inline-flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
              {label}
              {count > 0 && <span style={{ fontSize: 10, background: bg3, borderRadius: 10, padding: "1px 6px", color: textMuted }}>{count}</span>}
            </button>
          ))}
        </div>

        {/* Feed tabs */}
        {(networkTab === "feed" || networkTab === "feed-following") && (
          <div>
            {/* Compose */}
            <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 14, padding: "18px", marginBottom: 32 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <Avatar initials={myInitials} size={40} dark={dark} />
                <div style={{ flex: 1 }}>
                  <textarea
                    placeholder="what are you building? share an update..."
                    value={newPostContent}
                    onChange={e => setNewPostContent(e.target.value)}
                    rows={newPostContent ? 4 : 2}
                    style={{ ...inputStyle, resize: "none", fontSize: 13, padding: "10px 14px", background: bg3, borderColor: "transparent", lineHeight: 1.65, transition: "height 0.15s" }}
                  />
                  {newPostContent.trim() && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                      {/* Media preview */}
                      {newPostMediaUrl && (
                        <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
                          {newPostMediaType === "audio" ? (
                            <div style={{ fontSize: 11, color: text, padding: "8px 12px", background: bg3, borderRadius: 8, display: "flex", gap: 6, alignItems: "center" }}>
                              ♪ {newPostMediaUrl.split("/").pop().split("?")[0]}
                            </div>
                          ) : newPostMediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                            <img src={newPostMediaUrl} alt="" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, border: `1px solid ${border}` }} />
                          ) : (
                            <div style={{ fontSize: 11, color: textMuted, padding: "6px 10px", background: bg3, borderRadius: 6 }}>file: {newPostMediaUrl.split("/").pop()}</div>
                          )}
                          <button onClick={() => { setNewPostMediaUrl(""); setNewPostMediaType(""); }} style={{ position: "absolute", top: 4, right: 4, background: bg, border: `1px solid ${border}`, borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", color: text, fontFamily: "inherit" }}>✕</button>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {/* Image/video upload */}
                        <label style={{ cursor: "pointer", flexShrink: 0 }}>
                          <div style={{ ...btnG, padding: "6px 12px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}>↑ photo/video</div>
                          <input type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            showToast("Uploading...");
                            const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
                            const path = `posts/${authUser.id}/${Date.now()}-${safeName}`;
                            const { error } = await supabase.storage.from("user-uploads").upload(path, file);
                            if (error) { showToast(`Upload failed: ${error.message}`); return; }
                            const { data: { publicUrl } } = supabase.storage.from("user-uploads").getPublicUrl(path);
                            setNewPostMediaUrl(publicUrl);
                            setNewPostMediaType(file.type.startsWith("video") ? "video" : "image");
                            showToast("Ready.");
                          }} />
                        </label>
                        {/* Audio upload */}
                        <label style={{ cursor: "pointer", flexShrink: 0 }}>
                          <div style={{ ...btnG, padding: "6px 12px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}>♪ audio</div>
                          <input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac" style={{ display: "none" }} onChange={async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            showToast("Uploading audio...");
                            const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
                            const path = `posts/${authUser.id}/${Date.now()}-${safeName}`;
                            const { error } = await supabase.storage.from("user-uploads").upload(path, file);
                            if (error) { showToast(`Upload failed: ${error.message}`); return; }
                            const { data: { publicUrl } } = supabase.storage.from("user-uploads").getPublicUrl(path);
                            setNewPostMediaUrl(publicUrl);
                            setNewPostMediaType("audio");
                            showToast("Audio ready.");
                          }} />
                        </label>
                        <input placeholder="or paste a YouTube URL..." value={newPostMediaUrl.includes("youtube") || newPostMediaUrl.includes("youtu.be") ? newPostMediaUrl : ""} onChange={e => { setNewPostMediaUrl(e.target.value); setNewPostMediaType("youtube"); }} style={{ ...inputStyle, fontSize: 11, padding: "6px 10px", flex: 1 }} />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <select value={newPostProject} onChange={e => setNewPostProject(e.target.value)} style={{ ...inputStyle, fontSize: 11, padding: "6px 10px", flex: 1 }}>
                          <option value="">tag a project (optional)</option>
                          {myProjects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </select>
                        <button className="hb" onClick={handleCreatePost} style={{ ...btnP, padding: "7px 18px", fontSize: 12, flexShrink: 0 }}>post</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Feed region filter */}
            <div style={{ marginBottom: 16, display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: textMuted, letterSpacing: "1px" }}>REGION</span>
              {["local","city","national","international"].map(r => { const sel = regionFilter === r; return <button key={r} className="hb" onClick={() => setRegionFilter(sel ? null : r)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{r}</button>; })}
            </div>

            {/* Feed */}
            {(() => {
              const visibleFeed = feedToShow.filter(post => matchesRegion((users.find(u => u.id === post.user_id)?.location), regionFilter, profile?.location));
              return visibleFeed.length === 0
                ? <div style={{ fontSize: 13, color: textMuted, padding: "24px 0" }}>
                    {regionFilter ? `no posts from ${regionFilter} builders yet.` : networkTab === "feed-following"
                      ? <>nothing yet from people you follow. <button className="hb" onClick={() => setNetworkTab("people")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>find people →</button></>
                      : <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 560 }}>
                          <div>no posts yet. be the first.</div>
                          <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                            try sharing: <span style={{ color: text }}>“just shipped onboarding v2 — looking for feedback”</span> or <span style={{ color: text }}>“need a designer for landing page polish”</span>.
                          </div>
                        </div>}
                  </div>
                : visibleFeed.map(post => <PostCard key={post.id} post={post} ctx={postCtx} />);
            })()}
          </div>
        )}

        {/* People tab */}
        {networkTab === "people" && (
          <div>
            <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {["Design","Engineering","Marketing","Music","Finance","AI/ML","Writing","Video","Product"].map(s => { const sel = networkFilter === s; return <button key={s} className="hb" onClick={() => setNetworkFilter(sel ? null : s)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                {networkFilter && <button className="hb" onClick={() => setNetworkFilter(null)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: "none", color: textMuted, border: `1px solid ${border}` }}>clear</button>}
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: textMuted, letterSpacing: "1px" }}>REGION</span>
                {["local","city","national","international"].map(r => { const sel = regionFilter === r; return <button key={r} className="hb" onClick={() => setRegionFilter(sel ? null : r)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{r}</button>; })}
              </div>
            </div>
            <div className="network-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {users.filter(u => {
                if (u.id === authUser?.id) return false;
                if (networkFilter && !(u.skills || []).includes(networkFilter)) return false;
                if (regionFilter && u.location) {
                  const loc = (u.location || "").toLowerCase();
                  const myLoc = (profile?.location || "").toLowerCase();
                  const myCity = myLoc.split(",")[0].trim();
                  if (regionFilter === "local" || regionFilter === "city") return loc.includes(myCity) && myCity.length > 0;
                  if (regionFilter === "national") return loc.includes("us") || loc.includes("usa") || loc.includes("united states") || (myLoc && loc.split(",").pop().trim() === myLoc.split(",").pop().trim());
                  if (regionFilter === "international") return myLoc && !loc.includes(myLoc.split(",").pop().trim().toLowerCase());
                }
                return true;
              }).map(u => <UserCard key={u.id} u={u} />)}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── MAIN RETURN ──

  // ── LOADING ──
  if (authLoading) return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&display=swap'); *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } html, body { width: 100%; min-height: 100vh; background: #0a0a0a; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 18, color: "#fff", letterSpacing: "-0.5px", marginBottom: 20 }}>[CoLab]</div>
        <div style={{ width: 20, height: 20, border: "2px solid #333", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
      </div>
    </div>
  );

  // ── LANDING ──
  if (screen === "landing") return (
    <div style={{ minHeight: "100vh", width: "100%", background: bg, color: text, fontFamily: "'DM Mono', monospace", overflowX: "hidden" }}>
      <style>{CSS}</style>
      <nav style={{ width: "100%", borderBottom: `1px solid ${border}`, position: "sticky", top: 0, background: bg, backdropFilter: "blur(12px)", zIndex: 50 }}>
        <div className="pad" style={{ padding: "0 40px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.5px", color: text }}>[CoLab]</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="hb" onClick={() => setDark(!dark)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, color: textMuted, fontFamily: "inherit" }}>{dark ? "☀" : "☾"}</button>
            <button className="hb" onClick={() => { setAuthMode("login"); setScreen("auth"); }} style={{ ...btnG, padding: "7px 16px", fontSize: 12 }}>Log in</button>
            <button className="hb" onClick={() => { setAuthMode("signup"); setScreen("auth"); }} style={{ ...btnP, padding: "7px 16px", fontSize: 12 }}>Get started</button>
          </div>
        </div>
      </nav>
      <div className="pad fu" style={{ padding: "80px 40px 64px", borderBottom: `1px solid ${border}` }}>
        <div style={{ fontSize: 10, color: textMuted, letterSpacing: "3px", marginBottom: 20 }}>THE COLLABORATIVE WORKSPACE</div>
        <h1 className="hero-h1" style={{ fontSize: "clamp(52px, 9vw, 96px)", fontWeight: 400, lineHeight: 0.92, letterSpacing: "-4px", marginBottom: 28, color: text }}>
          Don't just<br />connect.<br /><span style={{ color: textMuted }}>Build together.</span>
        </h1>
        <p style={{ fontSize: 14, color: textMuted, maxWidth: 500, lineHeight: 1.85, marginBottom: 36 }}>CoLab is where founders, creatives, engineers, and makers find each other and actually get work done — in one place.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="hb" onClick={() => { setAuthMode("signup"); setScreen("auth"); }} style={{ background: text, color: bg, border: "none", borderRadius: 8, padding: "13px 28px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Start building →</button>
          <button className="hb" onClick={() => { setAuthMode("login"); setScreen("auth"); }} style={{ background: "none", color: textMuted, border: `1px solid ${border}`, borderRadius: 8, padding: "13px 28px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Log in</button>
        </div>
      </div>
      <div className="stat-grid" style={{ display: "flex", width: "100%", borderBottom: `1px solid ${border}` }}>
        {[[liveStats.builders,"builders"],[liveStats.projects,"active projects"],[skillCategoryCount,"skill categories"],["100%","free to start"]].map(([v,l],i) => (
          <div key={i} className="stat-item" style={{ flex: 1, borderRight: i < 3 ? `1px solid ${border}` : "none", padding: "24px 40px", textAlign: "center" }}>
            <div style={{ fontSize: 28, color: text, letterSpacing: "-1px" }}>{v}</div>
            <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>
      <div className="pad" style={{ padding: "72px 40px", borderBottom: `1px solid ${border}` }}>
        <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 36 }}>HOW IT WORKS</div>
        <div className="how-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
          {[["01","Build your profile","List your skills and what you're looking to work on."],["02","Find your match","Post a project or browse and apply to something that excites you."],["03","Build together","Tasks, updates, messaging, and plugin integrations — all in one place."]].map(([n,t,d],i) => (
            <div key={i} className="how-card card-h" style={{ padding: "32px 36px", background: bg2, border: `1px solid ${border}`, borderRight: i < 2 ? "none" : `1px solid ${border}`, transition: "border 0.2s" }}>
              <div style={{ fontSize: 11, color: textMuted, marginBottom: 14 }}>{n}</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: text, marginBottom: 8 }}>{t}</div>
              <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.75 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="pad" style={{ padding: "80px 40px", background: bg2, textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(30px, 5vw, 54px)", fontWeight: 400, letterSpacing: "-2px", marginBottom: 14, color: text }}>Ready to build?</h2>
        <p style={{ fontSize: 13, color: textMuted, marginBottom: 28 }}>Join hundreds of builders already collaborating on CoLab.</p>
        <button className="hb" onClick={() => { setAuthMode("signup"); setScreen("auth"); }} style={{ background: text, color: bg, border: "none", borderRadius: 8, padding: "14px 36px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Create your profile →</button>
      </div>
      <div className="pad" style={{ padding: "18px 40px", borderTop: `1px solid ${border}`, background: bg, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 12, color: textMuted }}>[CoLab] — build together.</div>
        <div style={{ fontSize: 11, color: textMuted }}>© 2026</div>
      </div>
    </div>
  );

  // ── AUTH ──
  if (screen === "auth") return (
    <div style={{ minHeight: "100vh", width: "100%", background: bg, color: text, fontFamily: "'DM Mono', monospace", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <style>{CSS}</style>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <button onClick={() => setScreen("landing")} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, marginBottom: 32 }}>← back</button>
        <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 14 }}>{authMode === "signup" ? "CREATE ACCOUNT" : authMode === "reset" ? "RESET PASSWORD" : "WELCOME BACK"}</div>
        <h2 style={{ fontSize: 26, fontWeight: 400, letterSpacing: "-1px", marginBottom: 28, color: text }}>
          {authMode === "signup" ? "Join CoLab." : authMode === "reset" ? "Reset your password." : "Log in."}
        </h2>
        {authMode === "reset" ? (
          resetSent ? (
            <div style={{ fontSize: 13, color: textMuted, lineHeight: 1.7 }}>
              Check your email — we sent a reset link to <strong style={{ color: text }}>{authEmail}</strong>.
              <div style={{ marginTop: 20 }}>
                <button onClick={() => { setAuthMode("login"); setResetSent(false); }} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>← back to login</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>EMAIL</label>
                <input style={inputStyle} type="email" placeholder="you@example.com" value={authEmail} onChange={e => setAuthEmail(e.target.value)} />
              </div>
              {authError && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 14 }}>{authError}</div>}
              <button className="hb" onClick={handlePasswordReset} style={{ ...btnP, width: "100%", padding: "13px", marginBottom: 16 }}>Send reset link →</button>
              <button onClick={() => setAuthMode("login")} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>← back to login</button>
            </div>
          )
        ) : (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              <div><label style={labelStyle}>EMAIL</label><input style={inputStyle} type="email" placeholder="you@example.com" value={authEmail} onChange={e => setAuthEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && (authMode === "signup" ? handleSignUp() : handleLogin())} /></div>
              <div><label style={labelStyle}>PASSWORD</label><input style={inputStyle} type="password" placeholder="••••••••" value={authPassword} onChange={e => setAuthPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && (authMode === "signup" ? handleSignUp() : handleLogin())} /></div>
            </div>
            {authError && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 14 }}>{authError}</div>}
            <button className="hb" onClick={authMode === "signup" ? handleSignUp : handleLogin} style={{ ...btnP, width: "100%", padding: "13px", marginBottom: 16 }}>
              {authMode === "signup" ? "Create account →" : "Log in →"}
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: textMuted }}>
                {authMode === "signup" ? "Already have an account?" : "Don't have an account?"}
                <button onClick={() => setAuthMode(authMode === "signup" ? "login" : "signup")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline", marginLeft: 6 }}>
                  {authMode === "signup" ? "Log in" : "Sign up"}
                </button>
              </div>
              {authMode === "login" && <button onClick={() => setAuthMode("reset")} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline" }}>forgot password?</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── ONBOARDING ──
  if (screen === "onboard") {
    const steps = [
      { label: "what's your name?", field: "name", placeholder: "Your display name", type: "input" },
      { label: "pick a username.", field: "username", placeholder: "@handle — unique, no spaces", type: "username" },
      { label: "what do you do?", field: "role", placeholder: "Founder, Designer, Engineer, Musician...", type: "input" },
      { label: "what's your story?", field: "bio", placeholder: "What are you about? What are you trying to build?", type: "textarea" },
      { label: "what are your skills?", field: "skills", type: "skills" },
    ];
    const step = steps[onboardStep];
    const isLast = onboardStep === steps.length - 1;
    const canNext = step.field === "skills" ? onboardData.skills.length > 0 : step.type === "username" ? (onboardData.username || "").length >= 3 : (onboardData[step.field] || "").trim().length > 0;
    return (
      <div style={{ minHeight: "100vh", width: "100%", background: bg, color: text, fontFamily: "'DM Mono', monospace", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
        <style>{CSS}</style>
        <div style={{ width: "100%", maxWidth: 480 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 40, justifyContent: "center" }}>
            {steps.map((_, i) => <div key={i} style={{ width: i === onboardStep ? 20 : 6, height: 6, borderRadius: 3, background: i <= onboardStep ? text : textSub, transition: "all 0.3s" }} />)}
          </div>
          <div className="fu" key={onboardStep}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 14 }}>STEP {onboardStep + 1} OF {steps.length}</div>
            <h2 style={{ fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 400, letterSpacing: "-1px", marginBottom: 26, color: text }}>{step.label}</h2>
            {step.type === "input" && <input autoFocus style={{ background: "none", border: "none", borderBottom: `1px solid ${border}`, padding: "10px 0", color: text, fontSize: "clamp(16px, 4vw, 18px)", width: "100%", fontFamily: "inherit", outline: "none" }} placeholder={step.placeholder} value={onboardData[step.field] || ""} onChange={e => setOnboardData({ ...onboardData, [step.field]: e.target.value })} onKeyDown={e => e.key === "Enter" && canNext && (isLast ? handleFinishOnboard() : setOnboardStep(s => s + 1))} />}
            {step.type === "username" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${border}`, marginBottom: 8 }}>
                  <span style={{ fontSize: "clamp(16px, 4vw, 18px)", color: textMuted, paddingBottom: 10, paddingTop: 10 }}>@</span>
                  <input autoFocus style={{ background: "none", border: "none", padding: "10px 0 10px 4px", color: text, fontSize: "clamp(16px, 4vw, 18px)", flex: 1, fontFamily: "inherit", outline: "none" }} placeholder="yourhandle" value={onboardData.username || ""} onChange={e => setOnboardData({ ...onboardData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} onKeyDown={e => e.key === "Enter" && canNext && (isLast ? handleFinishOnboard() : setOnboardStep(s => s + 1))} />
                </div>
                <div style={{ fontSize: 11, color: textMuted }}>lowercase letters, numbers, underscores only</div>
              </div>
            )}
            {step.type === "textarea" && <textarea autoFocus style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "12px", color: text, fontSize: 13, width: "100%", fontFamily: "inherit", outline: "none", resize: "none", lineHeight: 1.7 }} rows={4} placeholder={step.placeholder} value={onboardData[step.field] || ""} onChange={e => setOnboardData({ ...onboardData, [step.field]: e.target.value })} />}
            {step.type === "skills" && (
              <div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {SKILLS.map(s => { const sel = onboardData.skills.includes(s); return <button key={s} className="hb" onClick={() => setOnboardData({ ...onboardData, skills: sel ? onboardData.skills.filter(x => x !== s) : [...onboardData.skills, s] })} style={{ padding: "6px 14px", borderRadius: 4, fontSize: 12, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                </div>
                <div style={{ fontSize: 11, color: onboardData.skills.length === 0 ? text : textMuted, marginTop: 4 }}>
                  {onboardData.skills.length === 0 ? "select at least one to continue" : `${onboardData.skills.length} selected`}
                </div>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 30 }}>
              <button className="hb" onClick={() => onboardStep === 0 ? setScreen("auth") : setOnboardStep(s => s - 1)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>{onboardStep === 0 ? "← back" : "← previous"}</button>
              <button className="hb" onClick={() => isLast ? handleFinishOnboard() : setOnboardStep(s => s + 1)} disabled={!canNext} style={{ background: canNext ? text : textSub, color: bg, border: "none", borderRadius: 8, padding: "11px 24px", fontSize: 12, fontWeight: 500, cursor: canNext ? "pointer" : "default", fontFamily: "inherit", transition: "all 0.2s" }}>
                {isLast ? "Enter CoLab →" : "continue →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN APP ──
  const navItems = [
    { id: "explore", label: "explore" },
    { id: "network", label: "network" },
    { id: "workspace", label: "work" },
    { id: "messages", label: "msgs", badge: unreadDms },
    { id: "profile", label: profile?.username ? `@${profile.username}` : profile?.name?.split(" ")[0]?.toLowerCase() || "me" },
  ];

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: bg, color: text, fontFamily: "'DM Mono', monospace", transition: "background-color 0.3s ease, color 0.3s ease", overflowX: "hidden" }}>
      <style>{CSS}</style>

      {/* NAV */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, width: "100%", background: dark ? "rgba(10,10,10,0.97)" : "rgba(255,255,255,0.97)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${border}`, padding: "0 12px", display: "flex", alignItems: "center", gap: 8, height: 50 }}>
        <button onClick={() => { setAppScreen("explore"); setActiveProject(null); setViewingProfile(null); setViewFullProfile(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500, color: text, letterSpacing: "-0.5px", flexShrink: 0 }}>[CoLab]</button>

        {/* Global search — full bar on desktop, expandable on mobile */}
        <div style={{ position: "relative", flexShrink: 0 }} className="search-wrap">
          {/* Desktop: full input */}
          <div className="search-desktop" style={{ width: 180 }}>
            <input
              placeholder="search people..."
              value={globalSearch}
              onChange={e => { setGlobalSearch(e.target.value); setShowGlobalSearch(e.target.value.length > 0); }}
              onBlur={() => setTimeout(() => setShowGlobalSearch(false), 150)}
              style={{ ...inputStyle, fontSize: 11, padding: "5px 10px", borderRadius: 6 }}
            />
          </div>
          {/* Mobile: tap to expand */}
          <div className="search-mobile" style={{ display: "none" }}>
            <button onClick={() => { setShowGlobalSearch(!showGlobalSearch); if (!showGlobalSearch) setTimeout(() => document.getElementById("mobile-search")?.focus(), 50); }} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11, color: textMuted, fontFamily: "inherit" }}>
              srch
            </button>
            {showGlobalSearch && (
              <div style={{ position: "fixed", top: 58, left: 12, right: 12, background: bg, border: `1px solid ${border}`, borderRadius: 10, zIndex: 300, padding: "10px", boxShadow: dark ? "0 8px 24px rgba(0,0,0,0.8)" : "0 8px 24px rgba(0,0,0,0.15)" }}>
                <input
                  id="mobile-search"
                  placeholder="search people..."
                  value={globalSearch}
                  onChange={e => setGlobalSearch(e.target.value)}
                  autoFocus
                  style={{ ...inputStyle, fontSize: 13, marginBottom: globalSearch.length > 0 ? 8 : 0 }}
                />
                {globalSearch.length > 0 && users.filter(u => u.id !== authUser?.id && u.name?.toLowerCase().includes(globalSearch.toLowerCase())).slice(0, 3).map(u => (
                  <button key={u.id} onClick={() => { setViewFullProfile(u); setGlobalSearch(""); setShowGlobalSearch(false); }} style={{ width: "100%", padding: "10px 12px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 10, alignItems: "center", textAlign: "left", borderTop: `1px solid ${border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    <Avatar initials={initials(u.name)} size={28} dark={dark} />
                    <div>
                      <div style={{ fontSize: 13, color: text }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: textMuted }}>{u.role}</div>
                    </div>
                  </button>
                ))}
                {globalSearch.length > 0 && projects.filter(p => p.title?.toLowerCase().includes(globalSearch.toLowerCase())).slice(0, 2).map(p => (
                  <button key={p.id} onClick={() => { setActiveProject(p); loadProjectData(p.id); setAppScreen("workspace"); setProjectTab("tasks"); setGlobalSearch(""); setShowGlobalSearch(false); }} style={{ width: "100%", padding: "10px 12px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 10, alignItems: "center", textAlign: "left", borderTop: `1px solid ${border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    <span style={{ fontSize: 16 }}>◈</span>
                    <div>
                      <div style={{ fontSize: 13, color: text }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: textMuted }}>project · {p.category}</div>
                    </div>
                  </button>
                ))}
                {globalSearch.length > 0 && posts.filter(p => p.content?.toLowerCase().includes(globalSearch.toLowerCase())).slice(0, 2).map(p => {
                  const postUser = users.find(u => u.id === p.user_id);
                  return (
                    <button key={p.id} onClick={() => { setAppScreen("network"); setNetworkTab("feed"); setGlobalSearch(""); setShowGlobalSearch(false); }} style={{ width: "100%", padding: "10px 12px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left", borderTop: `1px solid ${border}` }}
                      onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <span style={{ fontSize: 16 }}>◎</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: textMuted, marginBottom: 2 }}>{postUser?.name}</div>
                        <div style={{ fontSize: 13, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.content.slice(0, 60)}</div>
                      </div>
                    </button>
                  );
                })}
                {globalSearch.length > 0 &&
                  users.filter(u => u.id !== authUser?.id && u.name?.toLowerCase().includes(globalSearch.toLowerCase())).length === 0 &&
                  projects.filter(p => p.title?.toLowerCase().includes(globalSearch.toLowerCase())).length === 0 &&
                  posts.filter(p => p.content?.toLowerCase().includes(globalSearch.toLowerCase())).length === 0 && (
                  <div style={{ fontSize: 12, color: textMuted, padding: "8px 4px" }}>no results.</div>
                )}
              </div>
            )}
          </div>
          {/* Desktop dropdown results */}
          {showGlobalSearch && globalSearch.length > 0 && (
            <div className="search-desktop" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, width: 260, background: bg, border: `1px solid ${border}`, borderRadius: 8, zIndex: 300, overflow: "hidden", boxShadow: dark ? "0 8px 24px rgba(0,0,0,0.6)" : "0 8px 24px rgba(0,0,0,0.1)" }}>
              {/* People */}
              {users.filter(u => u.id !== authUser?.id && u.name?.toLowerCase().includes(globalSearch.toLowerCase())).slice(0, 3).map(u => (
                <button key={u.id} onClick={() => { setViewFullProfile(u); setGlobalSearch(""); setShowGlobalSearch(false); }}
                  style={{ width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 8, alignItems: "center", textAlign: "left" }}
                  onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                  <Avatar initials={initials(u.name)} size={22} dark={dark} />
                  <div>
                    <div style={{ fontSize: 11, color: text }}>{u.name}</div>
                    <div style={{ fontSize: 10, color: textMuted }}>{u.role}</div>
                  </div>
                </button>
              ))}
              {/* Projects */}
              {projects.filter(p => p.title?.toLowerCase().includes(globalSearch.toLowerCase())).slice(0, 2).map(p => (
                <button key={p.id} onClick={() => { setActiveProject(p); loadProjectData(p.id); setAppScreen("workspace"); setProjectTab("tasks"); setGlobalSearch(""); setShowGlobalSearch(false); }}
                  style={{ width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 8, alignItems: "center", textAlign: "left", borderTop: `1px solid ${border}` }}
                  onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                  <span style={{ fontSize: 14 }}>◈</span>
                  <div>
                    <div style={{ fontSize: 11, color: text }}>{p.title}</div>
                    <div style={{ fontSize: 10, color: textMuted }}>project · {p.category}</div>
                  </div>
                </button>
              ))}
              {/* Posts */}
              {posts.filter(p => p.content?.toLowerCase().includes(globalSearch.toLowerCase())).slice(0, 2).map(p => {
                const postUser = users.find(u => u.id === p.user_id);
                return (
                  <button key={p.id} onClick={() => { setAppScreen("network"); setNetworkTab("feed"); setGlobalSearch(""); setShowGlobalSearch(false); }}
                    style={{ width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 8, alignItems: "flex-start", textAlign: "left", borderTop: `1px solid ${border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    <span style={{ fontSize: 14 }}>◎</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: textMuted, marginBottom: 2 }}>{postUser?.name}</div>
                      <div style={{ fontSize: 11, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.content.slice(0, 60)}</div>
                    </div>
                  </button>
                );
              })}
              {users.filter(u => u.id !== authUser?.id && u.name?.toLowerCase().includes(globalSearch.toLowerCase())).length === 0 &&
               projects.filter(p => p.title?.toLowerCase().includes(globalSearch.toLowerCase())).length === 0 &&
               posts.filter(p => p.content?.toLowerCase().includes(globalSearch.toLowerCase())).length === 0 && (
                <div style={{ padding: "12px 14px", fontSize: 12, color: textMuted }}>no results.</div>
              )}
            </div>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Nav items */}
        <div style={{ display: "flex", gap: 0, alignItems: "center" }}>
          {navItems.map(({ id, label, badge }) => (
            <button key={id} onClick={() => { setAppScreen(id); setActiveProject(null); setViewingProfile(null); setViewFullProfile(null); setShowNotifications(false); }}
              style={{ position: "relative", background: appScreen === id && !activeProject && !showNotifications ? bg3 : "none", color: appScreen === id && !activeProject && !showNotifications ? text : textMuted, border: "none", borderRadius: 6, padding: "5px 5px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0 }}>
              {label}
              {badge > 0 && <span style={{ position: "absolute", top: 2, right: 2, width: 5, height: 5, borderRadius: "50%", background: text, border: `1px solid ${bg}` }} />}
            </button>
          ))}
          <button onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications) setNotifications(prev => prev.map(n => ({ ...n, read: true }))); }}
            style={{ position: "relative", background: showNotifications ? bg3 : "none", border: "none", borderRadius: 6, padding: "5px 4px", cursor: "pointer", color: textMuted, fontSize: 12, fontFamily: "inherit", flexShrink: 0 }}>
            ◎{unreadNotifs > 0 && <span style={{ position: "absolute", top: 3, right: 3, width: 5, height: 5, borderRadius: "50%", background: text, border: `1px solid ${bg}` }} />}
          </button>
          <button onClick={() => setDark(!dark)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "3px 5px", cursor: "pointer", fontSize: 10, color: textMuted, fontFamily: "inherit", flexShrink: 0, marginLeft: 2 }}>{dark ? "☀" : "☾"}</button>
          <button onClick={() => setShowSettings(true)}
            style={{ background: "none", border: "none", borderRadius: 6, padding: "5px 4px", cursor: "pointer", color: textMuted, fontSize: 12, fontFamily: "inherit" }}>
            ⚙
          </button>
        </div>
      </nav>

      {/* NOTIFICATIONS */}
      {showNotifications && (
        <>
          <div onClick={() => setShowNotifications(false)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
          <div className="notif-w" style={{ position: "fixed", top: 58, right: 16, width: 340, background: bg, border: `1px solid ${border}`, borderRadius: 12, zIndex: 200, animation: "slideIn 0.2s ease", boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.6)" : "0 8px 32px rgba(0,0,0,0.1)", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${border}`, fontSize: 11, color: textMuted, letterSpacing: "1px", display: "flex", justifyContent: "space-between" }}>
              NOTIFICATIONS
              {notifications.length > 0 && <button className="hb" onClick={() => setNotifications([])} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 10 }}>clear all</button>}
            </div>
            {notifications.length === 0 && mentionNotifications.length === 0 ? <div style={{ padding: "24px 16px", fontSize: 12, color: textMuted }}>no notifications.</div>
              : <>
                {mentionNotifications.map(n => (
                  <div key={n.id} style={{ padding: "14px 16px", borderBottom: `1px solid ${border}`, display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 12, color: text, marginBottom: 2 }}>{n.from_name} mentioned you</div>
                      <div style={{ fontSize: 11, color: textMuted, fontStyle: "italic" }}>"{n.context}..."</div>
                    </div>
                    <button className="hb" onClick={async () => { await supabase.from("mention_notifications").update({ read: true }).eq("id", n.id); setMentionNotifications(prev => prev.filter(x => x.id !== n.id)); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", flexShrink: 0 }}>✕</button>
                  </div>
                ))}
                {notifications.map(n => (
                <div key={n.id} style={{ padding: "14px 16px", borderBottom: `1px solid ${border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <div style={{ fontSize: 12, color: text }}>{n.text}</div>
                    <button className="hb" onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", marginLeft: 8 }}>✕</button>
                  </div>
                  <div style={{ marginBottom: n.type === "application" ? 10 : 0 }}>
                    {n.projectId && (
                      <button className="hb" onClick={() => {
                        const proj = projects.find(p => p.id === n.projectId);
                        if (proj) { setActiveProject(proj); loadProjectData(proj.id); setAppScreen("workspace"); setProjectTab("tasks"); setShowNotifications(false); }
                      }} style={{ background: "none", border: "none", padding: 0, color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline" }}>
                        {n.sub}
                      </button>
                    )}
                    {!n.projectId && <span style={{ fontSize: 11, color: textMuted }}>{n.sub}</span>}
                    <span style={{ fontSize: 11, color: textMuted }}> · {n.time}</span>
                  </div>
                  {n.type === "application" && n.applicant && (
                    <div>
                      <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                          <Avatar initials={n.applicant.initials} size={28} dark={dark} />
                          <div><div style={{ fontSize: 12, color: text }}>{n.applicant.name}</div><div style={{ fontSize: 10, color: textMuted }}>{n.applicant.role}{n.applicant.availability ? ` · ${n.applicant.availability}` : ""}</div></div>
                        </div>
                        {n.applicant.motivation && <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.6, marginTop: 6 }}>{n.applicant.motivation.slice(0, 100)}...</div>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="hb" onClick={() => handleAccept(n)} style={{ flex: 1, background: text, color: bg, border: "none", borderRadius: 6, padding: "7px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>accept</button>
                        <button className="hb" onClick={() => handleDecline(n)} style={{ flex: 1, background: "none", color: textMuted, border: `1px solid ${border}`, borderRadius: 6, padding: "7px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>decline</button>
                      </div>
                    </div>
                  )}
                </div>
                ))}
              </>
            }
          </div>
        </>
      )}

      {viewingProfile && <ProfileModal u={viewingProfile} onClose={() => setViewingProfile(null)} />}
      {renderApplicationForm()}
      {reviewingApplicants && <ReviewModal project={reviewingApplicants} onClose={closeReviewApplicants} />}

      {/* NEW DM PICKER */}
      {showNewDm && (
        <div style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.9)" : "rgba(200,200,200,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(10px)", padding: 16 }} onClick={() => setShowNewDm(false)}>
          <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "24px", width: "100%", maxWidth: 440, maxHeight: "70vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px" }}>NEW MESSAGE</div>
              <button onClick={() => setShowNewDm(false)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>✕</button>
            </div>
            <input
              autoFocus
              placeholder="search people..."
              value={newDmSearch}
              onChange={e => setNewDmSearch(e.target.value)}
              style={{ ...inputStyle, marginBottom: 12 }}
            />
            <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
              {users
                .filter(u => u.id !== authUser?.id && (!newDmSearch || u.name?.toLowerCase().includes(newDmSearch.toLowerCase()) || u.username?.toLowerCase().includes(newDmSearch.toLowerCase()) || u.role?.toLowerCase().includes(newDmSearch.toLowerCase())))
                .slice(0, 20)
                .map(u => (
                  <button key={u.id} onClick={() => { openDm(u); setShowNewDm(false); setNewDmSearch(""); }} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 12px", background: "none", border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}
                    onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    <Avatar initials={initials(u.name)} size={36} dark={dark} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: text }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.role}{u.username ? ` · @${u.username}` : ""}</div>
                    </div>
                  </button>
                ))
              }
              {users.filter(u => u.id !== authUser?.id && (!newDmSearch || u.name?.toLowerCase().includes(newDmSearch.toLowerCase()) || u.username?.toLowerCase().includes(newDmSearch.toLowerCase()) || u.role?.toLowerCase().includes(newDmSearch.toLowerCase()))).length === 0 && (
                <div style={{ fontSize: 12, color: textMuted, padding: "20px 0", textAlign: "center" }}>no one found.</div>
              )}
            </div>
          </div>
        </div>
      )}
      {showBannerEditor && <BannerEditor pixels={bannerPixels} onSave={saveBanner} onClose={() => setShowBannerEditor(false)} dark={dark} bg={bg} border={border} text={text} textMuted={textMuted} />}

      {/* COLLABORATORS MODAL */}
      {showCollaborators && (() => {
        const collabs = getCollaborators(showCollaborators);
        const isMe = showCollaborators === authUser?.id;
        const subjectUser = isMe ? profile : users.find(u => u.id === showCollaborators);
        return (
          <div onClick={() => setShowCollaborators(null)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.92)" : "rgba(200,200,200,0.88)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(12px)", padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "28px", width: "100%", maxWidth: 480, maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 6 }}>COLLABORATORS</div>
                  <div style={{ fontSize: 16, color: text, fontWeight: 400 }}>{isMe ? "your" : `${subjectUser?.name?.split(" ")[0]}'s`} network</div>
                  <div style={{ fontSize: 12, color: textMuted, marginTop: 3 }}>{collabs.length} people {isMe ? "you've" : "they've"} built with</div>
                </div>
                <button onClick={() => setShowCollaborators(null)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>✕</button>
              </div>
              {collabs.length === 0 ? (
                <div style={{ fontSize: 13, color: textMuted, padding: "20px 0", textAlign: "center" }}>
                  {isMe ? "no collaborators yet. accept someone into a project to start building your network." : "no collaborators yet."}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {collabs.map((c, i) => (
                    <div key={c.user.id} onClick={() => { setShowCollaborators(null); setViewFullProfile(c.user); }} style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 16px", background: bg2, borderRadius: i === 0 && collabs.length === 1 ? 10 : i === 0 ? "10px 10px 0 0" : i === collabs.length - 1 ? "0 0 10px 10px" : 0, border: `1px solid ${border}`, borderBottom: i < collabs.length - 1 ? "none" : `1px solid ${border}`, cursor: "pointer", transition: "opacity 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                      <Avatar initials={initials(c.user.name)} size={40} dark={dark} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: text, fontWeight: 400, marginBottom: 2 }}>{c.user.name}</div>
                        {c.user.username && <div style={{ fontSize: 11, color: textMuted, marginBottom: 3 }}>@{c.user.username}</div>}
                        <div style={{ fontSize: 11, color: textMuted }}>{c.user.role}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: textMuted, marginBottom: 2 }}>via</div>
                        <div style={{ fontSize: 11, color: text, maxWidth: 120, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.project?.title}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {isMe && collabs.length > 0 && (
                <div style={{ marginTop: 20, padding: "14px 16px", background: bg3, borderRadius: 8, border: `1px solid ${border}` }}>
                  <div style={{ fontSize: 12, color: text, marginBottom: 4 }}>grow your network</div>
                  <div style={{ fontSize: 11, color: textMuted }}>every accepted collaboration adds to your profile. the more you build, the stronger your reputation on CoLab.</div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* EXPLORE */}
      {!viewFullProfile && appScreen === "explore" && !activeProject && (
        <div className="pad fu" style={{ width: "100%", padding: "48px 32px" }}>
          {showFirstTimeGuide && renderFirstTimeGuide()}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 14 }}>FIND YOUR PEOPLE. BUILD SOMETHING REAL.</div>
            <h1 style={{ fontSize: "clamp(30px, 5vw, 56px)", fontWeight: 400, lineHeight: 1.0, letterSpacing: "-2.5px", marginBottom: 14, color: text }}>Don't just connect.<br />Build together.</h1>
            <p style={{ fontSize: 13, color: textMuted, maxWidth: 400, lineHeight: 1.8, marginBottom: 22 }}>Post your project. Find people with the skills you need. Get to work.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="hb" onClick={openCreateProjectFlow} style={btnP}>Post a project</button>
              <button className="hb" onClick={() => document.getElementById("feed")?.scrollIntoView({ behavior: "smooth" })} style={btnG}>Browse</button>
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${border}`, marginBottom: 24, display: "flex", gap: 32, paddingTop: 20, flexWrap: "wrap" }}>
            {[["open now", projects.filter(p => (p.collaborators||0) < (p.max_collaborators||2)).length],["projects", projects.length],["builders", users.length]].map(([l,v]) => (
              <div key={l}><div style={{ fontSize: 24, color: text, letterSpacing: "-1px" }}>{v}</div><div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>{l}</div></div>
            ))}
          </div>
          {projects.filter(p => p.featured && !p.archived && !p.is_private).length > 0 && (
            <div style={{ marginBottom: 28, padding: "16px 20px", background: bg2, border: `1px solid ${border}`, borderRadius: 10 }}>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 12 }}>★ FEATURED THIS WEEK</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {projects.filter(p => p.featured && !p.archived && !p.is_private).slice(0, 3).map(p => (
                  <div key={p.id} onClick={() => { setActiveProject(p); loadProjectData(p.id); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "8px 0", borderBottom: `1px solid ${border}` }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.6"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                    <div>
                      <div style={{ fontSize: 13, color: text }}>{p.title}</div>
                      <div style={{ fontSize: 10, color: textMuted }}>{p.owner_name} · {p.category}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                      {p.shipped && <span style={{ fontSize: 10, color: "#22c55e" }}>shipped</span>}
                      <span style={{ fontSize: 10, color: textMuted }}>{(p.skills || []).slice(0, 2).join(", ")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {trendingProjects.length > 0 && (
            <div style={{ marginBottom: 28, padding: "16px 20px", background: bg2, border: `1px solid ${border}`, borderRadius: 10 }}>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 12 }}>TRENDING</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {trendingProjects.map(p => (
                  <div key={p.id} onClick={() => { setActiveProject(p); loadProjectData(p.id); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "6px 0", borderBottom: `1px solid ${border}` }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.6"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                    <div>
                      <div style={{ fontSize: 13, color: text }}>{p.title}</div>
                      <div style={{ fontSize: 10, color: textMuted }}>{p.category}</div>
                    </div>
                    <div style={{ fontSize: 10, color: textMuted, flexShrink: 0 }}>{applications.filter(a => a.project_id === p.id).length} applicants</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div id="feed" style={{ borderBottom: `1px solid ${border}`, display: "flex" }}>
            {["for-you","all"].map(id => (
              <button key={id} onClick={() => setExploreTab(id)} style={{ background: "none", border: "none", borderBottom: exploreTab === id ? `1px solid ${text}` : "1px solid transparent", color: exploreTab === id ? text : textMuted, padding: "8px 0", fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginRight: 24, transition: "all 0.15s", display: "inline-flex", gap: 6, alignItems: "center" }}>
                {id === "for-you" ? "for you" : "all projects"}
                {id === "for-you" && forYou.length > 0 && <span style={{ fontSize: 10, background: bg3, borderRadius: 10, padding: "1px 6px", color: textMuted }}>{forYou.length}</span>}
              </button>
            ))}
          </div>
          {loading ? <Spinner dark={dark} /> : (
            <>
              {exploreTab === "for-you" && ((profile?.skills || []).length === 0
                ? <div style={{ padding: "36px 0", color: textMuted, fontSize: 13 }}>add skills to see matched projects. <button onClick={() => setAppScreen("profile")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>update profile →</button></div>
                : forYou.length === 0
                  ? <div style={{ padding: "36px 0", color: textMuted, fontSize: 13 }}>no matches yet. <button className="hb" onClick={() => setExploreTab("all")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>browse all →</button></div>
                  : <div><div style={{ padding: "14px 0 2px", fontSize: 11, color: textMuted }}>{forYou.length} project{forYou.length !== 1 ? "s" : ""} matching your skills</div>{forYou.map(p => <PRow key={p.id} p={p} />)}</div>
              )}
              {exploreTab === "all" && (
                <div>
                  <div style={{ padding: "14px 0 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <input placeholder="search projects..." value={search} onChange={e => setSearch(e.target.value)} style={inputStyle} />
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {["Design","Engineering","Marketing","Music","Video","Finance","AI/ML","Writing","Product"].map(s => { const sel = filterSkill === s; return <button key={s} className="hb" onClick={() => setFilterSkill(sel ? null : s)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                      {filterSkill && <button className="hb" onClick={() => setFilterSkill(null)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: "none", color: textMuted, border: `1px solid ${border}` }}>clear</button>}
                    </div>
                    {/* Region filter */}
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: textMuted, letterSpacing: "1px" }}>REGION</span>
                      {["local","city","national","international"].map(r => { const sel = regionFilter === r; return <button key={r} className="hb" onClick={() => setRegionFilter(sel ? null : r)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{r}</button>; })}
                    </div>
                  </div>
                  {allP.length === 0 ? <div style={{ padding: "36px 0", textAlign: "center", color: textMuted, fontSize: 12 }}>no results.</div> : allP.filter(p => !regionFilter || (p.location || "").toLowerCase().includes(regionFilter === "local" ? (profile?.location || "").split(",")[0].toLowerCase() : regionFilter === "city" ? (profile?.location || "").split(",")[0].toLowerCase() : regionFilter === "national" ? "us" : "")).map(p => <PRow key={p.id} p={p} />)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* EXPLORE DETAIL */}
      {appScreen === "explore" && activeProject && (
        <div className="pad fu" style={{ width: "100%", maxWidth: 700, margin: "0 auto", padding: "36px 24px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
            <button className="hb" onClick={() => setActiveProject(null)} style={{ ...btnG, padding: "6px 14px", fontSize: 11 }}>← back</button>
            <button className="hb" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/p/${activeProject.id}`).catch(() => {}); showToast("Link copied!"); }} style={{ ...btnG, padding: "6px 14px", fontSize: 11, marginLeft: "auto" }}>share ↗</button>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
            <button onClick={() => { const u = users.find(u => u.id === activeProject.owner_id); if (u) setViewingProfile(u); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <Avatar initials={activeProject.owner_initials} size={40} dark={dark} />
            </button>
            <div>
              <button onClick={() => { const u = users.find(u => u.id === activeProject.owner_id); if (u) setViewingProfile(u); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: text, textDecoration: "underline" }}>{activeProject.owner_name}</div>
              </button>
              <div style={{ fontSize: 11, color: textMuted }}>{new Date(activeProject.created_at).toLocaleDateString()} · {activeProject.category}</div>
            </div>
          </div>
          <h2 style={{ fontSize: "clamp(16px, 4vw, 20px)", fontWeight: 400, letterSpacing: "-0.8px", marginBottom: 10, color: text }}>{activeProject.title}</h2>
          <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 22 }}>{activeProject.description}</p>
          {(() => {
            const projectDriveUrl = extractFirstUrl(activeProject.description || "");
            if (!isGoogleDriveUrl(projectDriveUrl || "")) return null;
            return (
              <div style={{ marginBottom: 22 }}>
                <GoogleDriveCard url={projectDriveUrl} border={border} bg2={bg2} text={text} textMuted={textMuted} compact />
              </div>
            );
          })()}
          {(activeProject.goals || activeProject.timeline) && (
            <div style={{ marginBottom: 22, padding: "14px 16px", background: bg2, border: `1px solid ${border}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 }}>
              {activeProject.goals && (
                <div>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 4 }}>GOALS</div>
                  <div style={{ fontSize: 13, color: text, lineHeight: 1.65 }}>{activeProject.goals}</div>
                </div>
              )}
              {activeProject.timeline && (
                <div>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 4 }}>TIMELINE</div>
                  <div style={{ fontSize: 13, color: text }}>{activeProject.timeline}</div>
                </div>
              )}
            </div>
          )}
          <div style={{ marginBottom: 22 }}>
            <div style={labelStyle}>SKILLS NEEDED</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {(activeProject.skills || []).map(s => { const m = (profile?.skills || []).includes(s); return <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${m ? (dark ? "#ffffff45" : "#00000030") : border}`, borderRadius: 3, color: m ? text : textMuted, fontWeight: m ? 500 : 400 }}>{s}{m ? " ★" : ""}</span>; })}
            </div>
          </div>
          {getMatchScore(activeProject) > 0 && <div style={{ padding: "10px 14px", background: bg2, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12, color: textMuted, marginBottom: 18 }}>you match <strong style={{ color: text }}>{getMatchScore(activeProject)}</strong> of the skills needed.</div>}
          {appliedProjectIds.includes(activeProject.id)
            ? <div style={{ textAlign: "center", padding: 12, background: bg2, borderRadius: 8, color: textMuted, fontSize: 12, border: `1px solid ${border}` }}>applied — waiting to hear back</div>
            : activeProject.owner_id === authUser?.id
              ? <button className="hb" onClick={() => openReviewApplicants(activeProject)} style={{ ...btnP, width: "100%", padding: "13px" }}>review applicants ({applications.filter(a => a.project_id === activeProject.id && a.status === "pending").length})</button>
              : <button className="hb" onClick={() => openApplicationForm(activeProject)} style={{ ...btnP, width: "100%", padding: "13px" }}>Apply to collaborate →</button>
          }
        </div>
      )}

      {/* NETWORK */}
      {!viewFullProfile && appScreen === "network" && renderNetwork()}

      {/* MESSAGES */}
      {appScreen === "messages" && (
        <div className={activeDmThread ? "msgs-has-thread" : "msgs-no-thread"} style={{ width: "100%", padding: "0", display: "flex", height: "calc(100vh - 50px)" }}>
          {/* Left panel — thread list */}
          <div className="msgs-left" style={{ width: 260, flexShrink: 0, borderRight: `1px solid ${border}`, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 20px 12px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px" }}>MESSAGES</div>
              <button className="hb" onClick={() => { setShowNewDm(true); setNewDmSearch(""); }} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 5, width: 22, height: 22, cursor: "pointer", fontSize: 14, color: textMuted, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>+</button>
            </div>
            {dmThreads.length === 0
              ? <div style={{ padding: "24px 20px", fontSize: 12, color: textMuted, lineHeight: 1.7 }}>no conversations yet.<br /><button className="hb" onClick={() => { setShowNewDm(true); setNewDmSearch(""); }} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline", padding: 0 }}>start one →</button></div>
              : dmThreads.map(thread => {
                  const otherId = thread.user_a === authUser?.id ? thread.user_b : thread.user_a;
                  const other = users.find(u => u.id === otherId);
                  if (!other) return null;
                  const isActive = activeDmThread?.id === thread.id;
                  const threadMsgs = dmMessages[thread.id] || [];
                  const lastMsg = threadMsgs[threadMsgs.length - 1];
                  return (
                    <div key={thread.id} onClick={() => openDmThread({ thread, otherUser: other })}
                      style={{ padding: "14px 20px", borderBottom: `1px solid ${border}`, cursor: "pointer", background: isActive ? bg2 : "none", display: "flex", gap: 12, alignItems: "center" }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = bg2; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "none"; }}>
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <Avatar initials={initials(other.name)} size={36} dark={dark} />
                        {thread.unread && <span style={{ position: "absolute", top: 0, right: 0, width: 8, height: 8, borderRadius: "50%", background: text, border: `2px solid ${bg}` }} />}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, color: text, fontWeight: thread.unread ? 500 : 400 }}>{other.name}</div>
                        {lastMsg
                          ? <div style={{ fontSize: 11, color: textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lastMsg.sender_id === authUser?.id ? "you: " : ""}{lastMsg.text}</div>
                          : <div style={{ fontSize: 11, color: textMuted }}>{other.role}</div>
                        }
                      </div>
                    </div>
                  );
                })
            }
          </div>

          {/* Right panel — conversation */}
          <div className="msgs-right" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            {activeDmThread ? (
              <>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${border}`, display: "flex", gap: 12, alignItems: "center" }}>
                  <button className="msgs-back hb" onClick={() => setActiveDmThread(null)} style={{ display: "none", background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 18, padding: "0 8px 0 0", lineHeight: 1 }}>‹</button>
                  <Avatar initials={initials(activeDmThread.otherUser?.name)} size={32} dark={dark} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: text, fontWeight: 500 }}>{activeDmThread.otherUser?.name}</div>
                    <div style={{ fontSize: 11, color: textMuted }}>{activeDmThread.otherUser?.role}</div>
                  </div>
                  <button className="hb" onClick={() => setViewingProfile(activeDmThread.otherUser)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", color: textMuted, fontFamily: "inherit" }}>profile</button>
                  <button className="hb" onClick={() => { if (window.confirm("Delete this entire conversation? This cannot be undone.")) handleDeleteThread(activeDmThread.id); }} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", color: textMuted, fontFamily: "inherit" }}>delete chat</button>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
                  {(dmMessages[activeDmThread.id] || []).length === 0
                    ? <div style={{ fontSize: 12, color: textMuted, textAlign: "center", marginTop: 40, lineHeight: 1.7 }}>
                        start the conversation.<br />
                        share context, ask a question, or drop an attachment.
                      </div>
                    : (dmMessages[activeDmThread.id] || []).map((msg, i) => {
                        const isMe = msg.sender_id === authUser?.id;
                        const isRead = (msg.read_by || []).length > 0;
                        const isEditing = editingMessage?.id === msg.id;
                        return (
                          <div key={msg.id || i} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexDirection: isMe ? "row-reverse" : "row" }}>
                            <Avatar initials={msg.sender_initials} size={26} dark={dark} />
                            <div style={{ maxWidth: "70%" }}>
                              {isEditing ? (
                                <div style={{ display: "flex", gap: 6 }}>
                                  <input value={editMessageText} onChange={e => setEditMessageText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleEditDm(msg.id, editMessageText); if (e.key === "Escape") setEditingMessage(null); }} style={{ ...inputStyle, fontSize: 12, padding: "6px 10px" }} autoFocus />
                                  <button onClick={() => handleEditDm(msg.id, editMessageText)} style={{ ...btnP, padding: "6px 10px", fontSize: 11, flexShrink: 0 }}>save</button>
                                </div>
                              ) : (
                                <div style={{ background: isMe ? text : bg2, color: isMe ? bg : text, padding: "9px 13px", borderRadius: isMe ? "14px 14px 2px 14px" : "14px 14px 14px 2px", fontSize: 13, lineHeight: 1.55, border: isMe ? "none" : `1px solid ${border}` }}>
                                  {renderMessageBody(msg.text, isMe)}{msg.edited && <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 6 }}>edited</span>}
                                </div>
                              )}
                              <div style={{ fontSize: 10, color: textMuted, marginTop: 3, textAlign: isMe ? "right" : "left", display: "flex", gap: 8, justifyContent: isMe ? "flex-end" : "flex-start", alignItems: "center" }}>
                                <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                                {isMe && isRead && <span style={{ fontSize: 9 }}>✓✓</span>}
                                {isMe && <button className="hb" onClick={() => { setEditingMessage({ id: msg.id }); setEditMessageText(msg.text); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>edit</button>}
                                {isMe && <button className="hb" onClick={() => handleDeleteDm(msg.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>delete</button>}
                              </div>
                            </div>
                          </div>
                        );
                      })
                  }
                  <div ref={dmEndRef} />
                </div>
                <div style={{ padding: "14px 20px", borderTop: `1px solid ${border}`, display: "flex", gap: 10 }}>
                  <input placeholder="message..." value={dmInput} onChange={e => setDmInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSendDm()} style={{ ...inputStyle, fontSize: 13 }} autoFocus />
                  <label style={{ ...btnG, padding: "10px 12px", cursor: "pointer", flexShrink: 0 }}>
                    + file
                    <input type="file" multiple style={{ display: "none" }} onChange={(e) => addDmAttachments(Array.from(e.target.files || []), activeDmThread.id)} />
                  </label>
                  <button className="hb" onClick={handleSendDm} style={{ ...btnP, padding: "10px 18px", flexShrink: 0 }}>send</button>
                </div>
                {!!(dmAttachments[activeDmThread.id] || []).length && (
                  <div style={{ padding: "0 20px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {(dmAttachments[activeDmThread.id] || []).map((a) => (
                      <div key={a.tempId} style={{ fontSize: 11, color: textMuted, display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                        <span>
                          {a.status === "failed" ? <button className="hb" onClick={() => retryDmAttachment(activeDmThread.id, a.tempId)} style={{ background: "none", border: "none", color: text, textDecoration: "underline", fontSize: 11, fontFamily: "inherit" }}>retry</button> : `${a.status} ${a.progress}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: textMuted, fontSize: 13 }}>
                {dmThreads.length > 0 ? "select a conversation →" : (
                  <div style={{ textAlign: "center", lineHeight: 1.7 }}>
                    message someone from their profile to get started.<br />
                    {(myCollaborators || []).slice(0, 3).map((c) => (
                      <button key={c.user.id} className="hb" onClick={() => openDm(c.user)} style={{ background: "none", border: "none", color: text, textDecoration: "underline", margin: "0 4px", fontFamily: "inherit", fontSize: 12 }}>{c.user.name}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* WORKSPACE */}
      {appScreen === "workspace" && !activeProject && (
        <div className="pad fu" style={{ width: "100%", padding: "44px 32px" }}>
          {showFirstTimeGuide && renderFirstTimeGuide()}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, flexWrap: "wrap", gap: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 8 }}>WORKSPACE</div>
              <h2 style={{ fontSize: "clamp(20px, 4vw, 26px)", fontWeight: 400, letterSpacing: "-1.5px", color: text }}>{profile?.name ? `${profile.name.split(" ")[0]}'s workspace.` : "Your workspace."}</h2>
            </div>
            <button className="hb" onClick={openCreateProjectFlow} style={btnP}>+ new project</button>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, marginBottom: 36, border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden" }}>
            {[
              ["projects", myProjects.length],
              ["applied to", appliedProjectIds.length],
              ["followers", followers.length],
              ["notifications", unreadNotifs],
            ].map(([label,val],i) => (
              <div key={i} style={{ padding: "16px 18px", background: bg2, borderRight: i < 3 ? `1px solid ${border}` : "none" }}>
                <div style={{ fontSize: "clamp(18px, 3vw, 24px)", fontWeight: 400, color: text, letterSpacing: "-1px" }}>{val}</div>
                <div style={{ fontSize: 10, color: textMuted, marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Two col: my projects + applications */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 36 }}>
            {/* My projects */}
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 14 }}>MY PROJECTS</div>
              {loading ? <Spinner dark={dark} /> : myProjects.length === 0
                ? <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 12, color: text, marginBottom: 6 }}>No projects yet.</div>
                    <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.6, marginBottom: 10 }}>Start by creating your first project or browse open projects to collaborate.</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="hb" onClick={openCreateProjectFlow} style={{ ...btnP, padding: "8px 12px", fontSize: 11 }}>Create your first project</button>
                      <button className="hb" onClick={openJoinProjectFlow} style={{ ...btnG, padding: "8px 12px", fontSize: 11 }}>Find collaborators / join a project</button>
                    </div>
                  </div>
                : <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {myProjects.map((p,i) => {
                      const pendingApps = applications.filter(a => a.project_id === p.id && a.status === "pending").length;
                      const health = projectHealthById[p.id] || { status: PROJECT_HEALTH.STALLED, reason: "No project signals" };
                      return (
                        <div key={p.id} style={{ background: bg2, borderRadius: i === 0 && myProjects.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === myProjects.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < myProjects.length - 1 ? "none" : `1px solid ${border}`, padding: "12px 16px", cursor: "pointer", transition: "opacity 0.15s" }}
                          onMouseEnter={e => e.currentTarget.style.opacity = "0.8"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                          onClick={() => { setActiveProject(p); loadProjectData(p.id); setProjectTab("tasks"); }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: text, letterSpacing: "-0.3px", marginBottom: 2 }}>{p.title}</div>
                              <div style={{ fontSize: 11, color: textMuted }}>{p.category}{pendingApps > 0 ? ` · ${pendingApps} pending` : ""}</div>
                            </div>
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, border: `1px solid ${border}`, color: health.status === PROJECT_HEALTH.ACTIVE ? "#22c55e" : health.status === PROJECT_HEALTH.AT_RISK ? "#f59e0b" : "#ef4444" }}>
                              {health.status}
                            </span>
                            {pendingApps > 0 && <button className="hb" onClick={e => { e.stopPropagation(); openReviewApplicants(p); }} style={{ fontSize: 10, padding: "2px 8px", border: `1px solid ${border}`, borderRadius: 4, background: "none", color: text, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>review</button>}
                          </div>
                          {/* Task-based progress */}
                          {(() => {
                            const projTasks = projectTasksById[p.id] || [];
                            const done = projTasks.filter(t => t.done).length;
                            const prog = projTasks.length > 0 ? Math.round((done / projTasks.length) * 100) : (p.progress || 0);
                            return (
                              <div>
                                <ProgressBar value={prog} dark={dark} />
                                <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>
                                  {projTasks.length > 0 ? `${done}/${projTasks.length} tasks · ${prog}%` : `${prog}%`}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
              }
            {projects.filter(p => p.owner_id === authUser?.id && p.archived).length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 10 }}>ARCHIVED</div>
                {projects.filter(p => p.owner_id === authUser?.id && p.archived).map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: bg2, border: `1px solid ${border}`, borderRadius: 6, marginBottom: 4, opacity: 0.6 }}>
                    <div style={{ fontSize: 12, color: text }}>{p.title}</div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <button className="hb" onClick={() => handleUnarchiveProject(p.id)}
                        style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 10 }}>restore</button>
                      <button className="hb" onClick={() => handleDeleteArchivedProject(p.id)}
                        style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontFamily: "inherit", fontSize: 10 }}>delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>

            {/* Applications + recent activity */}
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 14 }}>APPLICATIONS</div>
              {appliedProjectIds.length === 0
                ? <div style={{ fontSize: 12, color: textMuted, marginBottom: 24 }}>no applications yet.</div>
                : <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: 24 }}>
                    {projects.filter(p => appliedProjectIds.includes(p.id)).map((p,i,arr) => {
                      const myApp = applications.find(a => a.project_id === p.id && a.applicant_id === authUser?.id);
                      return (
                        <div key={p.id} style={{ background: bg2, borderRadius: i === 0 && arr.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === arr.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < arr.length - 1 ? "none" : `1px solid ${border}`, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, color: text, marginBottom: 1 }}>{p.title}</div><div style={{ fontSize: 10, color: textMuted }}>{p.owner_name}</div></div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: 10, color: myApp?.status === "accepted" ? text : textMuted, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px" }}>{myApp?.status || "pending"}</span>
                            {myApp?.status === "declined" && <button className="hb" onClick={() => handleRemoveDeniedApp(myApp.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>✕</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
              }

              {/* Pending notifications */}
              {notifications.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 14 }}>NEEDS ATTENTION</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {notifications.slice(0, 3).map(n => (
                      <div key={n.id} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: text, marginBottom: 1 }}>{n.text}</div>
                          <div style={{ fontSize: 10, color: textMuted }}>{n.sub}</div>
                        </div>
                        <button className="hb" onClick={() => { setShowNotifications(true); setAppScreen("workspace"); }} style={{ fontSize: 10, padding: "2px 8px", border: `1px solid ${border}`, borderRadius: 3, background: "none", color: text, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>review</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PROJECT SPACE */}
      {appScreen === "workspace" && activeProject && (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", height: "calc(100vh - 50px)" }}>
          {/* Project header */}
          <div className="pad" style={{ padding: "16px 28px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", flexShrink: 0 }}>
            <button className="hb" onClick={() => setActiveProject(null)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>← workspace</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 400, color: text, letterSpacing: "-0.5px" }}>{activeProject.title}</div>
              <div style={{ fontSize: 11, color: textMuted, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span>{activeProject.category}</span>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, border: `1px solid ${border}`, color: (projectHealthById[activeProject.id]?.status || PROJECT_HEALTH.STALLED) === PROJECT_HEALTH.ACTIVE ? "#22c55e" : (projectHealthById[activeProject.id]?.status || PROJECT_HEALTH.STALLED) === PROJECT_HEALTH.AT_RISK ? "#f59e0b" : "#ef4444" }}>
                  {projectHealthById[activeProject.id]?.status || PROJECT_HEALTH.STALLED}
                </span>
                <span style={{ fontSize: 10 }}>{projectHealthById[activeProject.id]?.reason || "No project signals"}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              {(() => {
                const projTasks = tasks.filter(t => t.project_id === activeProject.id);
                const doneTasks = projTasks.filter(t => t.done).length;
                const prog = projTasks.length > 0 ? Math.round((doneTasks / projTasks.length) * 100) : (activeProject.progress || 0);
                return (
                  <span style={{ fontSize: 10, color: textMuted }}>
                    {projTasks.length > 0 ? `${doneTasks}/${projTasks.length} tasks · ${prog}%` : `${prog}%`}
                  </span>
                );
              })()}
              {activeProject.shipped && (
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, border: "1px solid #22c55e", color: "#22c55e" }}>shipped</span>
              )}
              {activeProject.owner_id === authUser?.id && !activeProject.shipped && (
                <button className="hb" onClick={() => { setShipPostContent(`just shipped: ${activeProject.title}. built it with the team on CoLab.`); setShowShipModal(true); }}
                  style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 10px", fontSize: 10, cursor: "pointer", color: textMuted, fontFamily: "inherit" }}>
                  ship it
                </button>
              )}
              {activeProject.owner_id === authUser?.id && (
                <button className="hb" onClick={() => handleToggleFeatured(activeProject.id, !activeProject.featured)}
                  style={{ background: activeProject.featured ? text : "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 10px", fontSize: 10, cursor: "pointer", color: activeProject.featured ? bg : textMuted, fontFamily: "inherit" }}>
                  {activeProject.featured ? "★ featured" : "feature"}
                </button>
              )}
              {activeProject.owner_id === authUser?.id && (
                <button className="hb" onClick={() => handleArchiveProject(activeProject.id)}
                  style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 10px", fontSize: 10, cursor: "pointer", color: textMuted, fontFamily: "inherit" }}>
                  archive
                </button>
              )}
            </div>
          </div>

          {/* Due this week banner */}
          {(() => {
            const now = new Date();
            const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            const upcoming = tasks.filter(t => t.project_id === activeProject.id && !t.done && t.due_date && new Date(t.due_date) <= weekOut);
            const overdue = upcoming.filter(t => new Date(t.due_date) < now);
            if (upcoming.length === 0) return null;
            const accentColor = overdue.length > 0 ? "#ef4444" : "#f97316";
            const bannerBg = overdue.length > 0 ? (dark ? "#1a000088" : "#fff5f5") : (dark ? "#1a0e0088" : "#fffbf0");
            return (
              <div className="pad" style={{ padding: "7px 28px", background: bannerBg, borderBottom: `1px solid ${accentColor}40`, display: "flex", gap: 10, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, color: accentColor, fontWeight: 500, flexShrink: 0 }}>
                  {overdue.length > 0 ? `${overdue.length} overdue` : ""}{overdue.length > 0 && upcoming.length > overdue.length ? " · " : ""}{upcoming.length > overdue.length ? `${upcoming.length - overdue.length} due this week` : ""}
                </span>
                <span style={{ fontSize: 10, color: textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {upcoming.slice(0, 3).map(t => t.text).join(" · ")}{upcoming.length > 3 ? ` +${upcoming.length - 3} more` : ""}
                </span>
              </div>
            );
          })()}

          {/* Today / Next Up */}
          {todayNextUp && (
            <div className="pad" style={{ padding: "12px 28px", borderBottom: `1px solid ${border}`, background: bg2 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.6px" }}>TODAY / NEXT UP</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: textMuted, border: `1px solid ${border}`, borderRadius: 999, padding: "2px 8px" }}>
                    {todayNextUp.remainingCount} task{todayNextUp.remainingCount !== 1 ? "s" : ""} remaining
                  </span>
                  {todayNextUp.isBlocked && (
                    <span style={{ fontSize: 10, color: "#ef4444", border: "1px solid #ef444440", borderRadius: 999, padding: "2px 8px", background: dark ? "#1a000088" : "#fff5f5" }}>
                      Project is blocked
                    </span>
                  )}
                  {todayNextUp.readyToShip && (
                    <span style={{ fontSize: 10, color: "#22c55e", border: "1px solid #22c55e55", borderRadius: 999, padding: "2px 8px", background: dark ? "#0a1a0a88" : "#f0fdf4" }}>
                      Ready to ship 🚀
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.2px", marginBottom: 8 }}>TASKS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {todayNextUp.focusTasks.map((task) => (
                      <div key={task.id} style={{ fontSize: 11, color: task.tone === "overdue" ? text : textMuted, display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.label} · {task.text}</span>
                        <span style={{ color: task.tone === "overdue" ? "#ef4444" : textMuted, flexShrink: 0 }}>
                          {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "no due date"}
                        </span>
                      </div>
                    ))}
                    {todayNextUp.remainingCount === 0 && (
                      <div style={{ fontSize: 11, color: "#22c55e" }}>All tasks complete. Nice work.</div>
                    )}
                    {todayNextUp.remainingCount > 0 && todayNextUp.focusTasks.length === 0 && (
                      <div style={{ fontSize: 11, color: textMuted }}>No urgent task picks. Continue with the board backlog.</div>
                    )}
                    {todayNextUp.focusTasks.length > 0 && todayNextUp.remainingCount > todayNextUp.focusTasks.length && (
                      <div style={{ fontSize: 10, color: textMuted }}>
                        +{todayNextUp.remainingCount - todayNextUp.focusTasks.length} additional task{todayNextUp.remainingCount - todayNextUp.focusTasks.length !== 1 ? "s" : ""} in backlog
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.2px", marginBottom: 8 }}>URGENT SIGNALS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {todayNextUp.unreadProjectMessages > 0 && (
                      <div style={{ fontSize: 11, color: text }}>
                        {todayNextUp.unreadProjectMessages} unread chat message{todayNextUp.unreadProjectMessages !== 1 ? "s" : ""}
                      </div>
                    )}
                    {todayNextUp.mentionCount > 0 && (
                      <div style={{ fontSize: 11, color: text }}>
                        {todayNextUp.mentionCount} mention{todayNextUp.mentionCount !== 1 ? "s" : ""} need reply
                      </div>
                    )}
                    {activeProject.owner_id === authUser?.id && todayNextUp.pendingApplicationsCount > 0 && (
                      <div style={{ fontSize: 11, color: text }}>
                        {todayNextUp.pendingApplicationsCount} pending applicant{todayNextUp.pendingApplicationsCount !== 1 ? "s" : ""}
                      </div>
                    )}
                    {!todayNextUp.hasUrgentSignals && (
                      <div style={{ fontSize: 11, color: textMuted }}>No urgent signals right now.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {collaborationNeeds && (
            <div className="pad" style={{ padding: "12px 28px", borderBottom: `1px solid ${border}`, background: bg2 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.6px" }}>THIS PROJECT NEEDS…</div>
                <div style={{ fontSize: 10, color: textMuted }}>
                  {collaborationNeeds.hasExplicitNeeds ? "based on listed project skills" : "inferred from project activity"}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 12 }}>
                <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.2px", marginBottom: 8 }}>MISSING ROLES / SKILLS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {collaborationNeeds.roleNeeds.length > 0 ? collaborationNeeds.roleNeeds.map((need) => (
                      <div key={need.skill} style={{ fontSize: 11, color: text }}>
                        • {need.label}
                        {need.inferred && <span style={{ color: textMuted }}> (inferred)</span>}
                      </div>
                    )) : (
                      <div style={{ fontSize: 11, color: textMuted }}>No clear missing role signal yet.</div>
                    )}
                  </div>
                </div>

                <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.2px", marginBottom: 8 }}>COLLABORATION SIGNALS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {collaborationNeeds.demandSignals.length > 0 ? collaborationNeeds.demandSignals.map((signal) => (
                      <div key={signal.key} style={{ fontSize: 11, color: text }}>{signal.label}</div>
                    )) : (
                      <div style={{ fontSize: 11, color: textMuted }}>Team coverage looks healthy right now.</div>
                    )}
                  </div>
                </div>

                <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.2px", marginBottom: 8 }}>QUICK ACTIONS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    <button className="hb" onClick={() => { setProjectTab("team"); openInvitePanel(activeProject.id); }} style={{ ...btnG, padding: "6px 10px", fontSize: 11, textAlign: "left" }}>
                      Invite collaborator
                    </button>
                    <button
                      className="hb"
                      onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/p/${activeProject.id}`).catch(() => {}); showToast("Project link copied!"); }}
                      style={{ ...btnG, padding: "6px 10px", fontSize: 11, textAlign: "left" }}
                    >
                      Share project
                    </button>
                    {activeProject.owner_id === authUser?.id && collaborationNeeds.pendingApplicantsCount > 0 && (
                      <button className="hb" onClick={() => openReviewApplicants(activeProject)} style={{ ...btnP, padding: "6px 10px", fontSize: 11, textAlign: "left" }}>
                        Review applications ({collaborationNeeds.pendingApplicantsCount})
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab bar */}
          <div className="pad proj-tabs" style={{ padding: "0 28px", borderBottom: `1px solid ${border}`, display: "flex", flexShrink: 0, overflowX: "auto" }}>
            <TabBtn id="kanban" label="board" count={0} setter={setProjectTab} current={projectTab} />
            <TabBtn id="messages" label="chat" count={messages.length} setter={setProjectTab} current={projectTab} />
            <TabBtn id="files" label="files" count={0} setter={setProjectTab} current={projectTab} />
            <TabBtn id="docs" label="docs" count={0} setter={setProjectTab} current={projectTab} />
            <TabBtn id="updates" label="updates" count={projectUpdates.length} setter={setProjectTab} current={projectTab} />
            <TabBtn id="team" label="team" count={0} setter={setProjectTab} current={projectTab} />
            <TabBtn id="plugins" label="plugins" count={(activeProject.plugins || []).length} setter={(id) => { setProjectTab(id); if (id === "plugins" && activeProject.github_repo) { setGithubRepoInput(activeProject.github_repo); loadGithubCommits(activeProject.github_repo); } }} current={projectTab} />
            <TabBtn id="activity" label="activity" count={0} setter={setProjectTab} current={projectTab} />
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>

            {/* KANBAN BOARD */}
            {projectTab === "kanban" && (
              <div>
                {(activeProject.goals || activeProject.timeline) && (
                  <div style={{ marginBottom: 16, padding: "12px 16px", background: bg2, border: `1px solid ${border}`, borderRadius: 8 }}>
                    {activeProject.goals && <div style={{ fontSize: 12, color: textMuted, marginBottom: activeProject.timeline ? 4 : 0 }}><span style={{ color: text, fontWeight: 500 }}>Goals: </span>{activeProject.goals}</div>}
                    {activeProject.timeline && <div style={{ fontSize: 12, color: textMuted }}><span style={{ color: text, fontWeight: 500 }}>Timeline: </span>{activeProject.timeline}</div>}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  <input placeholder="add a task..." value={newTaskText} onChange={e => setNewTaskText(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddTask(activeProject.id)} style={{ ...inputStyle, fontSize: 12 }} />
                  <input type="date" value={taskDueDate || ""} onChange={e => setTaskDueDate(e.target.value)} style={{ ...inputStyle, fontSize: 11, width: "auto", flexShrink: 0 }} title="due date" />
                  <select value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)} style={{ ...inputStyle, fontSize: 12, maxWidth: 140 }}>
                    <option value="">assign...</option>
                    {projectMembers.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
                  </select>
                  <button className="hb" onClick={() => handleAddTask(activeProject.id)} style={{ ...btnP, padding: "10px 16px", flexShrink: 0, fontSize: 12 }}>add</button>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: taskOwnerSummary.unassigned > 0 ? "#f97316" : textMuted, border: `1px solid ${taskOwnerSummary.unassigned > 0 ? "#f97316" : border}`, borderRadius: 999, padding: "3px 9px", background: taskOwnerSummary.unassigned > 0 ? (dark ? "#211207" : "#fff7ed") : "transparent" }}>
                    {taskOwnerSummary.unassigned} unassigned
                  </span>
                  <span style={{ fontSize: 10, color: textMuted, border: `1px solid ${border}`, borderRadius: 999, padding: "3px 9px" }}>
                    {taskOwnerSummary.assignedToMe} assigned to you
                  </span>
                  {taskOwnerSummary.unassigned > 0 && <span style={{ fontSize: 10, color: textMuted }}>owner signal: unassigned tasks need coverage</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                  {[
                    { id: "todo", label: "TO DO", tasks: tasks.filter(t => t.project_id === activeProject.id && !t.done && !t.in_progress) },
                    { id: "inprogress", label: "IN PROGRESS", tasks: tasks.filter(t => t.project_id === activeProject.id && t.in_progress && !t.done) },
                    { id: "done", label: "DONE", tasks: tasks.filter(t => t.project_id === activeProject.id && t.done) },
                  ].map(col => (
                    <div key={col.id} style={{ background: bg2, borderRadius: 10, border: `1px solid ${border}`, padding: "14px", minHeight: 200 }}>
                      <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
                        {col.label} <span style={{ background: bg3, borderRadius: 10, padding: "1px 7px" }}>{col.tasks.length}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {col.tasks.map(task => {
                          const now = new Date();
                          const due = task.due_date ? new Date(task.due_date) : null;
                          const isOverdue = due && !task.done && due < now;
                          const isDueSoon = due && !task.done && !isOverdue && (due - now) < 3 * 24 * 60 * 60 * 1000;
                          const { assignee, isUnassigned, isAssignedToMe } = resolveTaskOwnership(task, projectMemberMap, authUser?.id);
                          const isEditingTitle = editingTaskId === task.id;
                          return (
                          <div
                            key={task.id}
                            onClick={() => { if (editingTaskId !== task.id) openTaskEditor(task); }}
                            style={{ background: isUnassigned ? (dark ? "#15120b" : "#fffaf2") : isAssignedToMe ? (dark ? "#101621" : "#f3f8ff") : isOverdue ? (dark ? "#1a0000" : "#fff5f5") : bg, border: `1px solid ${isUnassigned ? "#f59e0b" : isOverdue ? "#ef4444" : isDueSoon ? "#f97316" : isAssignedToMe ? "#60a5fa" : border}`, borderLeft: isUnassigned ? "3px solid #f59e0b" : isOverdue ? "3px solid #ef4444" : isDueSoon ? "3px solid #f97316" : isAssignedToMe ? "3px solid #60a5fa" : `1px solid ${border}`, borderRadius: 8, padding: "10px 12px", cursor: "pointer", opacity: taskUpdatePendingById[task.id] ? 0.6 : 1 }}>
                            {isEditingTitle ? (
                              <input
                                value={editingTaskTitle}
                                onChange={(e) => setEditingTaskTitle(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={async (e) => {
                                  if (e.key === "Escape") {
                                    setEditingTaskId(null);
                                    setEditingTaskTitle("");
                                  }
                                  if (e.key === "Enter" && editingTaskTitle.trim()) {
                                    await updateTaskOptimistic(task.id, { text: editingTaskTitle.trim() });
                                    setEditingTaskId(null);
                                    setEditingTaskTitle("");
                                  }
                                }}
                                onBlur={async () => {
                                  if (editingTaskTitle.trim() && editingTaskTitle.trim() !== task.text) {
                                    await updateTaskOptimistic(task.id, { text: editingTaskTitle.trim() });
                                  }
                                  setEditingTaskId(null);
                                  setEditingTaskTitle("");
                                }}
                                style={{ ...inputStyle, fontSize: 12, padding: "6px 8px", marginBottom: 6 }}
                                autoFocus
                              />
                            ) : (
                              <div onClick={(e) => { e.stopPropagation(); setEditingTaskId(task.id); setEditingTaskTitle(task.text || ""); }} style={{ fontSize: 12, color: text, marginBottom: 6, lineHeight: 1.4 }}>
                                {task.text}
                              </div>
                            )}
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              {assignee ? (
                                <>
                                  <Avatar initials={initials(assignee.name, "??")} size={16} dark={dark} />
                                  <div style={{ fontSize: 10, color: textMuted }}>{assignee.name}</div>
                                  {isAssignedToMe && <span style={{ fontSize: 9, color: "#60a5fa" }}>you</span>}
                                </>
                              ) : (
                                <span style={{ fontSize: 9, color: "#f59e0b", border: "1px solid #f59e0b", borderRadius: 999, padding: "1px 7px" }}>unassigned</span>
                              )}
                            </div>
                            {due && <div style={{ fontSize: 10, color: isOverdue ? "#ef4444" : isDueSoon ? "#f97316" : textMuted, marginBottom: 8, fontWeight: isOverdue ? 500 : 400 }}>{isOverdue ? "overdue · " : isDueSoon ? "due soon · " : "due "}{due.toLocaleDateString()}</div>}
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {col.id !== "todo" && <button className="hb" onClick={async (e) => { e.stopPropagation(); await supabase.from("tasks").update({ in_progress: false, done: false }).eq("id", task.id); setTasks(tasks.map(t => t.id === task.id ? { ...t, in_progress: false, done: false } : t)); }} style={{ fontSize: 9, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit" }}>← to do</button>}
                              {col.id === "todo" && <button className="hb" onClick={async (e) => { e.stopPropagation(); await supabase.from("tasks").update({ in_progress: true, done: false }).eq("id", task.id); setTasks(tasks.map(t => t.id === task.id ? { ...t, in_progress: true, done: false } : t)); }} style={{ fontSize: 9, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit" }}>in progress →</button>}
                              {col.id === "inprogress" && <button className="hb" onClick={(e) => { e.stopPropagation(); handleToggleTask(task); }} style={{ fontSize: 9, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit" }}>done →</button>}
                              <button className="hb" onClick={(e) => { e.stopPropagation(); openTaskEditor(task); }} style={{ fontSize: 9, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit" }}>edit</button>
                              <button className="hb" onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }} style={{ fontSize: 9, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                            </div>
                          </div>
                          );
                        })}
                        {col.tasks.length === 0 && <div style={{ fontSize: 11, color: textMuted, textAlign: "center", padding: "20px 0" }}>empty</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {projectTab === "kanban" && taskEditorTaskId && (() => {
              const task = tasks.find((item) => item.id === taskEditorTaskId);
              if (!task) return null;
              return (
                <div onClick={() => setTaskEditorTaskId(null)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.68)" : "rgba(0,0,0,0.45)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
                  <div onClick={(e) => e.stopPropagation()} style={{ width: "min(460px, 96vw)", background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 11, color: textMuted, letterSpacing: "1.2px", marginBottom: 8 }}>EDIT TASK</div>
                    <div style={{ fontSize: 13, color: text, marginBottom: 14, lineHeight: 1.5 }}>{task.text}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div>
                        <label style={labelStyle}>ASSIGNEE</label>
                        <select value={taskEditorDraft.assigneeId} onChange={(e) => setTaskEditorDraft((prev) => ({ ...prev, assigneeId: e.target.value }))} style={{ ...inputStyle, fontSize: 12 }}>
                          <option value="">unassigned</option>
                          {projectMembers.map((member) => (
                            <option key={member.id} value={member.id}>{member.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>DUE DATE</label>
                        <input type="date" value={taskEditorDraft.dueDate} onChange={(e) => setTaskEditorDraft((prev) => ({ ...prev, dueDate: e.target.value }))} style={{ ...inputStyle, fontSize: 12 }} />
                      </div>
                      {(hasTaskDescriptionField || Object.prototype.hasOwnProperty.call(task, "description")) && (
                        <div>
                          <label style={labelStyle}>DESCRIPTION</label>
                          <textarea rows={3} value={taskEditorDraft.description} onChange={(e) => setTaskEditorDraft((prev) => ({ ...prev, description: e.target.value }))} style={{ ...inputStyle, resize: "vertical", fontSize: 12 }} />
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                      <button className="hb" onClick={() => setTaskEditorTaskId(null)} style={{ ...btnG, padding: "8px 12px", fontSize: 11 }}>cancel</button>
                      <button
                        className="hb"
                        onClick={async () => {
                          const selectedAssignee = taskEditorDraft.assigneeId ? (projectMemberMap[taskEditorDraft.assigneeId] || null) : null;
                          const payload = {
                            assigned_to: selectedAssignee?.id || null,
                            due_date: taskEditorDraft.dueDate || null,
                          };
                          if (hasTaskDescriptionField || Object.prototype.hasOwnProperty.call(task, "description")) {
                            payload.description = taskEditorDraft.description || null;
                          }
                          await updateTaskOptimistic(task.id, payload);
                          setTaskEditorTaskId(null);
                        }}
                        style={{ ...btnP, padding: "8px 12px", fontSize: 11 }}
                      >
                        save
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* CHAT */}
            {projectTab === "messages" && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%", maxHeight: "calc(100vh - 220px)" }}>
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
                  {messages.length === 0 ? <div style={{ fontSize: 12, color: textMuted }}>no messages yet.</div>
                    : messages.map((msg, i) => {
                        const isMe = msg.from_user === authUser?.id;
                        const isEditing = editingMessage?.id === msg.id && editingMessage?.type === "project";
                        return (
                          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexDirection: isMe ? "row-reverse" : "row" }}>
                            <Avatar initials={msg.from_initials} size={28} dark={dark} />
                            <div style={{ maxWidth: "72%" }}>
                              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexDirection: isMe ? "row-reverse" : "row" }}>
                                <span style={{ fontSize: 11, fontWeight: 500, color: text }}>{isMe ? "you" : msg.from_name}</span>
                                <span style={{ fontSize: 10, color: textMuted }}>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                                {isMe && <button className="hb" onClick={() => { setEditingMessage({ id: msg.id, type: "project" }); setEditMessageText(msg.text); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>edit</button>}
                                {isMe && <button className="hb" onClick={() => handleDeleteProjectMessage(msg.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>delete</button>}
                              </div>
                              {isEditing ? (
                                <div style={{ display: "flex", gap: 6 }}>
                                  <input value={editMessageText} onChange={e => setEditMessageText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleEditProjectMessage(msg.id, editMessageText); if (e.key === "Escape") setEditingMessage(null); }} style={{ ...inputStyle, fontSize: 12, padding: "6px 10px" }} autoFocus />
                                  <button onClick={() => handleEditProjectMessage(msg.id, editMessageText)} style={{ ...btnP, padding: "6px 10px", fontSize: 11, flexShrink: 0 }}>save</button>
                                </div>
                              ) : (
                                <div style={{ background: isMe ? text : bg2, color: isMe ? bg : text, padding: "8px 12px", borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px", fontSize: 12, lineHeight: 1.6, border: isMe ? "none" : `1px solid ${border}` }}>
                                  {renderMessageBody(msg.text, isMe)}{msg.edited && <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 6 }}>edited</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                  }
                  <div ref={messagesEndRef} />
                </div>
                <div style={{ display: "flex", gap: 8, borderTop: `1px solid ${border}`, paddingTop: 12 }}>
                  <MentionInput dark={dark} value={newMessage} onChange={setNewMessage} onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSendMessage(activeProject.id)} placeholder="message the team... (@mention)" users={users} style={{ ...inputStyle, fontSize: 12 }} />
                  <label style={{ ...btnG, padding: "10px 12px", cursor: "pointer", flexShrink: 0 }}>
                    + file
                    <input type="file" multiple style={{ display: "none" }} onChange={(e) => addProjectAttachments(Array.from(e.target.files || []), activeProject.id)} />
                  </label>
                  <button className="hb" onClick={() => handleSendMessage(activeProject.id)} style={{ ...btnP, padding: "10px 16px", flexShrink: 0, fontSize: 12 }}>send</button>
                </div>
                {!!(projectAttachments[activeProject.id] || []).length && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {(projectAttachments[activeProject.id] || []).map((a) => (
                      <div key={a.tempId} style={{ fontSize: 11, color: textMuted, display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                        <span>
                          {a.status === "failed" ? <button className="hb" onClick={() => retryProjectAttachment(activeProject.id, a.tempId)} style={{ background: "none", border: "none", color: text, textDecoration: "underline", fontSize: 11, fontFamily: "inherit" }}>retry</button> : `${a.status} ${a.progress}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* FILES */}
            {projectTab === "files" && (
              <div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "inline-block", cursor: "pointer" }}>
                    <div style={{ ...btnP, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      ↑ upload file
                    </div>
                    <input type="file" style={{ display: "none" }} onChange={async (e) => {
                      const file = e.target.files[0];
                      await handleUploadProjectFile(activeProject.id, file);
                    }} />
                  </label>
                </div>
                {projectFiles.length === 0
                  ? <div style={{ fontSize: 13, color: textMuted }}>no files yet. upload something to share with the team.</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {projectFiles.map((file, i) => (
                        <div key={file.id} style={{ background: bg2, borderRadius: i === 0 && projectFiles.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === projectFiles.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < projectFiles.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 18px" }}>
                          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: file.type?.startsWith("image") ? 10 : 0 }}>
                            <div style={{ fontSize: 20, flexShrink: 0 }}>
                            {file.type?.startsWith("image") ? "img" : file.type?.includes("pdf") ? "pdf" : file.type?.includes("video") ? "vid" : "file"}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: text, marginBottom: 2 }}>{file.name}</div>
                              <div style={{ fontSize: 10, color: textMuted }}>{file.user_name} · {new Date(file.created_at).toLocaleDateString()} · {file.size ? `${(file.size / 1024).toFixed(0)}kb` : ""}</div>
                            </div>
                            <a href={file.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: text, textDecoration: "underline", flexShrink: 0 }}>open</a>
                            <button className="hb" onClick={async () => handleDeleteProjectFile(file)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", flexShrink: 0 }}>delete</button>
                          </div>
                          {file.type?.startsWith("image") && (
                            <img src={file.url} alt={file.name} style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 6, border: `1px solid ${border}` }} />
                          )}
                          {file.type?.includes("pdf") && (
                            <a href={file.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: text, border: `1px solid ${border}`, borderRadius: 6, padding: "6px 12px", textDecoration: "none" }}>↗ view PDF</a>
                          )}
                        </div>
                      ))}
                    </div>
                }
              </div>
            )}

            {/* DOCS */}
            {projectTab === "docs" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px" }}>SHARED DOCUMENTS</div>
                  <button className="hb" onClick={async () => {
                    const title = prompt("Document title:");
                    await handleCreateProjectDoc(activeProject.id, title);
                  }} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline" }}>+ new doc</button>
                </div>
                {activeDoc ? (
                  <div>
                    <button onClick={() => setActiveDoc(null)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, marginBottom: 16 }}>← all docs</button>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 16, color: text, fontWeight: 400, marginBottom: 4 }}>{activeDoc.title}</div>
                        <div style={{ fontSize: 10, color: textMuted }}>last edited by {activeDoc.last_edited_by}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="hb" onClick={() => setDocPreviewMode(m => !m)}
                          style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", color: textMuted, fontFamily: "inherit" }}>
                          {docPreviewMode ? "edit" : "preview"}
                        </button>
                        <button className="hb" onClick={async () => handleDeleteProjectDoc(activeDoc.id, true)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline" }}>delete doc</button>
                      </div>
                    </div>
                    {docPreviewMode ? (
                      <div style={{ ...inputStyle, minHeight: 400, fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap", overflow: "auto", cursor: "text" }}
                        onClick={() => setDocPreviewMode(false)}>
                        {(activeDoc.content || "").split("\n").map((line, i) => {
                          if (line.startsWith("# ")) return <h1 key={i} style={{ fontSize: 20, fontWeight: 400, letterSpacing: "-0.5px", marginBottom: 8 }}>{line.slice(2)}</h1>;
                          if (line.startsWith("## ")) return <h2 key={i} style={{ fontSize: 16, fontWeight: 400, marginBottom: 6 }}>{line.slice(3)}</h2>;
                          if (line.startsWith("### ")) return <h3 key={i} style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{line.slice(4)}</h3>;
                          if (line.startsWith("- ") || line.startsWith("* ")) return <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}><span>·</span><span>{line.slice(2)}</span></div>;
                          if (line === "") return <div key={i} style={{ height: "1em" }} />;
                          const bold = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/__(.*?)__/g, "<strong>$1</strong>");
                          const italic = bold.replace(/\*(.*?)\*/g, "<em>$1</em>").replace(/_(.*?)_/g, "<em>$1</em>");
                          return <div key={i} style={{ marginBottom: 4 }} dangerouslySetInnerHTML={{ __html: italic }} />;
                        })}
                        {!activeDoc.content && <span style={{ color: textMuted, fontStyle: "italic" }}>click to start writing...</span>}
                      </div>
                    ) : (
                      <textarea
                        value={activeDoc.content || ""}
                        onChange={e => setActiveDoc({ ...activeDoc, content: e.target.value })}
                        onBlur={async () => handleSaveProjectDoc(activeDoc)}
                        placeholder="Start writing... Use # for headers, **bold**, *italic*, - for bullets"
                        style={{ ...inputStyle, resize: "none", minHeight: 400, fontSize: 13, lineHeight: 1.8, fontFamily: "inherit" }}
                      />
                    )}
                  </div>
                ) : (
                  projectDocs.length === 0
                    ? <div style={{ fontSize: 13, color: textMuted }}>no documents yet. create one to start writing together.</div>
                    : <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {projectDocs.map((doc, i) => (
                          <div key={doc.id} style={{ background: bg2, borderRadius: i === 0 && projectDocs.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === projectDocs.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < projectDocs.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                            <div onClick={() => setActiveDoc(doc)} style={{ flex: 1, cursor: "pointer" }}
                              onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                              <div style={{ fontSize: 14, color: text, marginBottom: 4 }}>{doc.title}</div>
                              <div style={{ fontSize: 10, color: textMuted }}>edited by {doc.last_edited_by} · {new Date(doc.updated_at).toLocaleDateString()}</div>
                            </div>
                            <button className="hb" onClick={async () => handleDeleteProjectDoc(doc.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 11, flexShrink: 0 }}>delete</button>
                          </div>
                        ))}
                      </div>
                )}
              </div>
            )}

            {/* UPDATES */}
            {projectTab === "updates" && (
              <div>
                <div style={{ display: "flex", gap: 10, marginBottom: 22, alignItems: "flex-start" }}>
                  <Avatar initials={myInitials} size={28} dark={dark} />
                  <div style={{ flex: 1 }}>
                    <MentionInput dark={dark} value={newUpdate} onChange={setNewUpdate} placeholder="post an update... (@mention someone)" users={users} style={{ ...inputStyle, resize: "none", fontSize: 12, padding: "8px 12px" }} rows={2} />
                    {newUpdate.trim() && <button className="hb" onClick={() => handlePostUpdate(activeProject.id)} style={{ ...btnP, marginTop: 8, padding: "7px 14px", fontSize: 11 }}>post</button>}
                  </div>
                </div>
                {projectUpdates.length === 0 ? <div style={{ fontSize: 12, color: textMuted }}>no updates yet.</div>
                  : projectUpdates.map((u, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, marginBottom: 18 }}>
                      <Avatar initials={u.initials} size={28} dark={dark} />
                      <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: text }}>{u.author}</span>
                          <span style={{ fontSize: 10, color: textMuted }}>{new Date(u.created_at).toLocaleDateString()}</span>
                        </div>
                        <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.65 }}>{renderWithMentions(u.text)}</div>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}

            {/* TEAM */}
            {projectTab === "team" && (
              <div>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 14 }}>TEAM</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${border}` }}>
                  <Avatar initials={activeProject.owner_initials} size={36} dark={dark} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: text }}>{activeProject.owner_name}</div>
                    <div style={{ fontSize: 11, color: textMuted }}>project owner</div>
                  </div>
                  <span style={{ fontSize: 10, padding: "2px 8px", border: `1px solid ${border}`, borderRadius: 3, color: text }}>owner</span>
                </div>
                {applications.filter(a => a.project_id === activeProject.id && a.status === "accepted").map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${border}` }}>
                    <Avatar initials={a.applicant_initials} size={36} dark={dark} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: text }}>{a.applicant_name}</div>
                      <div style={{ fontSize: 11, color: textMuted }}>{a.applicant_role}</div>
                    </div>
                    {activeProject.owner_id === authUser?.id ? (
                      <select defaultValue={a.role || "contributor"} onChange={e => handleAssignRole(activeProject.id, a.applicant_id, e.target.value)} style={{ ...inputStyle, fontSize: 11, padding: "4px 8px", width: "auto" }}>
                        <option value="admin">admin</option>
                        <option value="contributor">contributor</option>
                        <option value="viewer">viewer</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: 10, padding: "2px 8px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{a.role || "contributor"}</span>
                    )}
                    {a.applicant_id === authUser?.id && (
                      <button className="hb" onClick={() => handleLeaveProject(a.id)}
                        style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 8px", fontSize: 10, cursor: "pointer", color: textMuted, fontFamily: "inherit", marginLeft: 4 }}>
                        leave
                      </button>
                    )}
                  </div>
                ))}
                {applications.filter(a => a.project_id === activeProject.id && a.status === "accepted").length === 0 && (
                  <div style={{ fontSize: 12, color: textMuted, padding: "16px 0" }}>no collaborators yet.</div>
                )}
                {activeProject.owner_id === authUser?.id && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${border}` }}>
                    <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 10 }}>INVITE</div>
                    <button className="hb" onClick={() => openInvitePanel(activeProject.id)}
                      style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "7px 14px", fontSize: 11, cursor: "pointer", color: text, fontFamily: "inherit" }}>
                      Invite Collaborators
                    </button>
                    {showInvitePanel && (
                      <div style={{ marginTop: 10, background: bg2, border: `1px solid ${border}`, borderRadius: 6, padding: "8px 12px", fontSize: 10, color: textMuted, wordBreak: "break-all" }}>
                        <div style={{ marginBottom: 8 }}>
                          {inviteLoading
                            ? "Creating invite link..."
                            : inviteLink || "Create a share link to invite collaborators into this project."}
                        </div>
                        {inviteError && <div style={{ marginBottom: 8, color: "#ef4444" }}>{inviteError}</div>}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button className="hb" onClick={() => generateInviteForProject(activeProject.id)}
                            style={{ background: "none", border: `1px solid ${border}`, borderRadius: 4, padding: "4px 8px", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 10, opacity: inviteLoading ? 0.6 : 1 }}
                            disabled={inviteLoading}>
                            {inviteLoading ? "Generating..." : inviteLink ? "Generate new link" : "Generate invite link"}
                          </button>
                          {inviteLink && (
                            <button className="hb" onClick={async () => {
                              try {
                                await navigator.clipboard?.writeText(inviteLink);
                                showToast("Copied.");
                              } catch {
                                showToast("Copy failed. Select and copy manually.");
                              }
                            }}
                              style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 10, textDecoration: "underline", padding: 0 }}>
                              copy link
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ACTIVITY */}
            {projectTab === "activity" && (
              <div>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 14 }}>ACTIVITY</div>
                {projectActivity.length === 0
                  ? <div style={{ fontSize: 13, color: textMuted }}>no activity yet.</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {projectActivity.map((a, i) => (
                        <div key={a.id} style={{ padding: "10px 14px", background: bg2, borderRadius: i === 0 && projectActivity.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === projectActivity.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < projectActivity.length - 1 ? "none" : `1px solid ${border}` }}>
                          <div style={{ fontSize: 12, color: text }}>{a.details}</div>
                          <div style={{ fontSize: 10, color: textMuted, marginTop: 3 }}>{relativeTime(a.created_at)}</div>
                        </div>
                      ))}
                    </div>
                }
              </div>
            )}

            {/* PLUGINS */}
            {projectTab === "plugins" && (
              <div>
                {/* GitHub — real integration */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 15 }}>◎</span>
                      <div>
                        <div style={{ fontSize: 13, color: text }}>GitHub</div>
                        <div style={{ fontSize: 11, color: textMuted }}>Connect a repo to see recent commits</div>
                      </div>
                    </div>
                    {activeProject.github_repo && (
                      <a href={`https://github.com/${activeProject.github_repo}`} target="_blank" rel="noreferrer"
                        style={{ fontSize: 10, color: textMuted, textDecoration: "none", border: `1px solid ${border}`, borderRadius: 4, padding: "2px 8px" }}>
                        {activeProject.github_repo} ↗
                      </a>
                    )}
                  </div>

                  {/* Repo input */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                    <input
                      placeholder="owner/repo or paste GitHub URL"
                      value={githubRepoInput}
                      onChange={e => setGithubRepoInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSaveGithubRepo(githubRepoInput)}
                      style={{ ...inputStyle, fontSize: 12, flex: 1 }}
                    />
                    <button className="hb" onClick={() => handleSaveGithubRepo(githubRepoInput)}
                      style={{ ...btnP, padding: "8px 14px", fontSize: 11, flexShrink: 0 }}>
                      connect
                    </button>
                    {activeProject.github_repo && (
                      <button className="hb" onClick={() => loadGithubCommits(activeProject.github_repo)}
                        style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "8px 12px", fontSize: 11, cursor: "pointer", color: textMuted, fontFamily: "inherit", flexShrink: 0 }}>
                        ↻
                      </button>
                    )}
                  </div>

                  {/* Commits feed */}
                  {githubLoading && <div style={{ fontSize: 12, color: textMuted, padding: "12px 0" }}>loading commits...</div>}
                  {githubError && <div style={{ fontSize: 12, color: "#ef4444", padding: "8px 12px", background: dark ? "#1a000088" : "#fff5f5", borderRadius: 6, border: "1px solid #ef444440" }}>{githubError}</div>}
                  {!githubLoading && !githubError && githubCommits.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 8 }}>RECENT COMMITS</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {githubCommits.map((c, i) => {
                          const msg = c.commit?.message?.split("\n")[0] || "";
                          const author = c.commit?.author?.name || "";
                          const dateStr = c.commit?.author?.date;
                          const sha = c.sha?.slice(0, 7);
                          return (
                            <a key={c.sha} href={c.html_url} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px", background: bg2, borderRadius: i === 0 && githubCommits.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === githubCommits.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < githubCommits.length - 1 ? "none" : `1px solid ${border}`, textDecoration: "none", transition: "opacity 0.15s" }}
                              onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                              <code style={{ fontSize: 10, color: textMuted, flexShrink: 0, marginTop: 2, fontFamily: "inherit" }}>{sha}</code>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg}</div>
                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>{author}{dateStr ? ` · ${relativeTime(dateStr)}` : ""}</div>
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {!githubLoading && !githubError && githubCommits.length === 0 && activeProject.github_repo && (
                    <div style={{ fontSize: 12, color: textMuted }}>no commits found.</div>
                  )}
                </div>

                <div style={{ borderTop: `1px solid ${border}`, paddingTop: 20 }}>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 10 }}>OTHER INTEGRATIONS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {PLUGINS.filter(p => p.id !== "github").map(plug => {
                      const connected = (activeProject.plugins || []).includes(plug.id);
                      return (
                        <div key={plug.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", background: connected ? bg2 : "none", borderRadius: 8, border: `1px solid ${connected ? border : border}`, opacity: connected ? 1 : 0.5 }}>
                          <span style={{ fontSize: 16, color: text, width: 20, textAlign: "center", flexShrink: 0 }}>{plug.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, color: text }}>{plug.name}</div>
                            <div style={{ fontSize: 11, color: textMuted }}>{plug.desc}</div>
                          </div>
                          <span style={{ fontSize: 10, color: textMuted }}>{connected ? "connected" : "coming soon"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FULL PROFILE VIEW — other users */}
      {viewFullProfile && (
        <div className="pad fu" style={{ width: "100%", padding: "48px 32px" }}>
          <button onClick={() => setViewFullProfile(null)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, marginBottom: 28 }}>← back</button>

          {/* Identity — mirrors own profile */}
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 20 }}>PROFILE</div>
          <div className="profile-identity-banner" style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 20 }}>
            <div style={{ flexShrink: 0 }}>
              <div className="profile-identity-row" style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
                <Avatar initials={initials(viewFullProfile.name)} size={52} dark={dark} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 400, color: text, letterSpacing: "-0.5px" }}>{viewFullProfile.name}</div>
                  {viewFullProfile.username && <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>@{viewFullProfile.username}</div>}
                  <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>{viewFullProfile.role}</div>
                  {viewFullProfile.location && <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>{viewFullProfile.location}</div>}
                  <div style={{ fontSize: 11, color: textMuted, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button onClick={() => setShowCollaborators(viewFullProfile.id)} style={{ background: "none", border: "none", color: getCollaborators(viewFullProfile.id).length > 0 ? text : textMuted, cursor: getCollaborators(viewFullProfile.id).length > 0 ? "pointer" : "default", fontFamily: "inherit", fontSize: 11, padding: 0, fontWeight: getCollaborators(viewFullProfile.id).length > 0 ? 500 : 400 }}>
                      {getCollaborators(viewFullProfile.id).length} collaborator{getCollaborators(viewFullProfile.id).length !== 1 ? "s" : ""}
                    </button>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>{projects.filter(p => p.owner_id === viewFullProfile.id).length} project{projects.filter(p => p.owner_id === viewFullProfile.id).length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              </div>
            </div>
            {viewFullProfile.banner_pixels && (
              <div className="profile-banner-shell" style={{ flex: 1, minWidth: 0, border: `1px solid ${border}`, borderRadius: 8, overflow: "hidden", background: dark ? "#000" : "#fff" }}>
                <div className="profile-banner-canvas">
                  <PixelBannerDisplay pixels={(() => { try { return JSON.parse(viewFullProfile.banner_pixels); } catch { return []; } })()} dark={dark} height={80} />
                </div>
              </div>
            )}
          </div>
          {viewFullProfile.bio && <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 20 }}>{viewFullProfile.bio}</p>}
          <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>COLLABORATORS</div>
            {getCollaborators(viewFullProfile.id).length === 0 ? (
              <div style={{ fontSize: 12, color: textMuted }}>no collaborators yet.</div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                  {getCollaborators(viewFullProfile.id).slice(0, 8).map((c) => (
                    <button key={c.user.id} className="hb" onClick={() => setViewFullProfile(c.user)} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${border}`, borderRadius: 8, background: bg2, padding: "10px 12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                      <Avatar initials={initials(c.user.name)} size={28} dark={dark} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.user.name}</div>
                        <div style={{ fontSize: 10, color: textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.user.username ? `@${c.user.username}` : c.user.role || "collaborator"}</div>
                      </div>
                    </button>
                  ))}
                </div>
                {getCollaborators(viewFullProfile.id).length > 8 && (
                  <button className="hb" onClick={() => setShowCollaborators(viewFullProfile.id)} style={{ marginTop: 10, background: "none", border: "none", color: text, fontSize: 11, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                    view all {getCollaborators(viewFullProfile.id).length} collaborators →
                  </button>
                )}
              </>
            )}
          </div>

          {/* Skills */}
          <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>SKILLS</div>
            {(viewFullProfile.skills || []).length === 0
              ? <div style={{ fontSize: 12, color: textMuted }}>no skills listed.</div>
              : <div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                    {viewFullProfile.skills.map(s => {
                      const shared = (profile?.skills || []).includes(s);
                      return <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${shared ? (dark ? "#ffffff40" : "#00000030") : border}`, borderRadius: 3, color: shared ? text : textMuted, fontWeight: shared ? 500 : 400 }}>{s}{shared ? " ★" : ""}</span>;
                    })}
                  </div>
                  {viewFullProfile.skills.filter(s => (profile?.skills || []).includes(s)).length > 0 &&
                    <div style={{ fontSize: 10, color: textMuted }}>★ {viewFullProfile.skills.filter(s => (profile?.skills || []).includes(s)).length} shared skills with you</div>
                  }
                </div>
            }
          </div>

          {/* Projects */}
          <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
            <div style={{ ...labelStyle, marginBottom: 12 }}>PROJECTS</div>
            {projects.filter(p => p.owner_id === viewFullProfile.id).length === 0
              ? <div style={{ fontSize: 12, color: textMuted }}>no projects yet.</div>
              : [...projects.filter(p => p.owner_id === viewFullProfile.id)].sort((a, b) => Number(b.featured) - Number(a.featured) || new Date(b.created_at) - new Date(a.created_at)).map(p => (
                  <div key={p.id} style={{ padding: "12px 0", borderBottom: `1px solid ${border}`, cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.6"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                    onClick={() => { setActiveProject(p); loadProjectData(p.id); setViewFullProfile(null); setAppScreen("workspace"); }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div style={{ fontSize: 13, color: text, fontWeight: p.featured ? 500 : 400 }}>{p.title}</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {p.featured && <span style={{ fontSize: 10, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px", color: text }}>pinned</span>}
                        <span style={{ fontSize: 10, border: `1px solid ${p.shipped ? "#22c55e66" : border}`, borderRadius: 3, padding: "1px 6px", color: p.shipped ? "#22c55e" : textMuted }}>{p.shipped ? "shipped" : "active"}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: textMuted, marginBottom: 6 }}>{p.description?.slice(0, 80)}{p.description?.length > 80 ? "..." : ""}</div>
                    {applications.filter((a) => a.project_id === p.id && a.status === "accepted").length > 0 && (
                      <div style={{ fontSize: 10, color: textMuted, marginBottom: 6 }}>
                        with {applications.filter((a) => a.project_id === p.id && a.status === "accepted").slice(0, 3).map((a) => users.find((u) => u.id === a.applicant_id)?.username ? `@${users.find((u) => u.id === a.applicant_id)?.username}` : users.find((u) => u.id === a.applicant_id)?.name).filter(Boolean).join(", ")}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {(p.skills || []).map(s => <span key={s} style={{ fontSize: 10, padding: "1px 7px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}
                    </div>
                  </div>
                ))
            }
          </div>

          {/* Portfolio */}
          <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
            <div style={{ ...labelStyle, marginBottom: 12 }}>PORTFOLIO</div>
            <FullProfilePortfolio userId={viewFullProfile.id} bg2={bg2} border={border} text={text} textMuted={textMuted} />
          </div>

          {/* Activity — applications they've sent */}
          <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
            <div style={{ ...labelStyle, marginBottom: 12 }}>ACTIVITY</div>
            {applications.filter(a => a.applicant_id === viewFullProfile.id && a.status === "accepted").length === 0
              ? <div style={{ fontSize: 12, color: textMuted }}>no public activity.</div>
              : applications.filter(a => a.applicant_id === viewFullProfile.id && a.status === "accepted").slice(0, 5).map(a => {
                  const p = projects.find(proj => proj.id === a.project_id);
                  return p ? (
                    <div key={a.id} style={{ padding: "10px 14px", background: bg2, borderRadius: 8, border: `1px solid ${border}`, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div><div style={{ fontSize: 12, color: text, marginBottom: 2 }}>Collaborating on {p.title}</div><div style={{ fontSize: 10, color: textMuted }}>{new Date(a.created_at).toLocaleDateString()}</div></div>
                      <span style={{ fontSize: 10, color: text, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px" }}>collaborator</span>
                    </div>
                  ) : null;
                })
            }
          </div>

          {/* Actions */}
          {viewFullProfile.id !== authUser?.id && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => handleFollow(viewFullProfile.id)} style={{ flex: 1, background: following.includes(viewFullProfile.id) ? bg3 : text, color: following.includes(viewFullProfile.id) ? textMuted : bg, border: `1px solid ${following.includes(viewFullProfile.id) ? border : text}`, borderRadius: 8, padding: "12px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", minWidth: 100 }}>
                {following.includes(viewFullProfile.id) ? "following" : "follow"}
              </button>
              <button onClick={() => { openDm(viewFullProfile); setViewFullProfile(null); }} style={{ flex: 1, background: "none", color: text, border: `1px solid ${border}`, borderRadius: 8, padding: "12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", minWidth: 100 }}>message</button>
              <button onClick={() => { setShowCreate(true); }} style={{ flex: 1, background: "none", color: text, border: `1px solid ${border}`, borderRadius: 8, padding: "12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", minWidth: 100 }}>collaborate →</button>
            </div>
          )}
        </div>
      )}

      {/* PROFILE */}
      {!viewFullProfile && appScreen === "profile" && (
        <div className="pad fu" style={{ width: "100%", padding: "48px 32px" }}>
          {!editProfile ? (
            <div>
              {/* Identity + Banner side by side */}
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 20 }}>PROFILE</div>
              <div className="profile-identity-banner" style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 20 }}>
                {/* Left: identity */}
                <div style={{ flexShrink: 0 }}>
                  <div className="profile-identity-row" style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
                    <Avatar initials={myInitials} size={52} dark={dark} />
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 400, color: text, letterSpacing: "-0.5px" }}>{profile?.name || "Anonymous"}</div>
                      {profile?.username
                        ? <div style={{ fontSize: 11, color: textMuted, marginTop: 1, cursor: "pointer" }} onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/u/${profile.username}`).catch(() => {}); showToast("Profile link copied!"); }} title="click to copy profile link">@{profile.username} ↗</div>
                        : <div style={{ fontSize: 11, color: textMuted, marginTop: 1, cursor: "pointer", textDecoration: "underline" }} onClick={() => setEditProfile(true)}>set a username →</div>
                      }
                      <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>{profile?.role}</div>
                      {profile?.location && <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>{profile.location}</div>}
                      <div style={{ fontSize: 11, color: textMuted, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <button onClick={() => setShowCollaborators(authUser?.id)} style={{ background: "none", border: "none", color: myCollaborators.length > 0 ? text : textMuted, cursor: myCollaborators.length > 0 ? "pointer" : "default", fontFamily: "inherit", fontSize: 11, padding: 0, fontWeight: myCollaborators.length > 0 ? 500 : 400 }}>
                          {myCollaborators.length} collaborator{myCollaborators.length !== 1 ? "s" : ""}
                        </button>
                        <span style={{ opacity: 0.4 }}>·</span>
                        <span>{myProjects.length} project{myProjects.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>{followers.length} follower{followers.length !== 1 ? "s" : ""} · {following.length} following</div>
                    </div>
                  </div>
                </div>
                {/* Right: pixel banner */}
                <div className="profile-banner-shell" style={{ flex: 1, minWidth: 0 }}>
                  <div className="profile-banner-card" style={{ position: "relative", border: `1px solid ${border}`, borderRadius: 8, overflow: "hidden", background: dark ? "#000" : "#fff", minHeight: 80, cursor: "pointer" }} onClick={() => setShowBannerEditor(true)}>
                    {bannerPixels.some(v => v) ? (
                      <div className="profile-banner-canvas"><PixelBannerDisplay pixels={bannerPixels} dark={dark} height={80} /></div>
                    ) : (
                      <div className="profile-banner-canvas" style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 11, color: textMuted }}>+ design your banner</span>
                      </div>
                    )}
                    <div style={{ position: "absolute", bottom: 4, right: 6, fontSize: 9, color: textMuted, opacity: 0.6 }}>edit</div>
                  </div>
                </div>
              </div>
              {profile?.bio && <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 20 }}>{profile.bio}</p>}
              <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
                <div style={{ ...labelStyle, marginBottom: 10 }}>COLLABORATORS</div>
                {myCollaborators.length === 0 ? (
                  <div style={{ fontSize: 12, color: textMuted }}>no collaborators yet. accept project applicants to build your network.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                    {myCollaborators.slice(0, 8).map((c) => (
                      <button key={c.user.id} className="hb" onClick={() => setViewFullProfile(c.user)} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${border}`, borderRadius: 8, background: bg2, padding: "10px 12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                        <Avatar initials={initials(c.user.name)} size={28} dark={dark} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.user.name}</div>
                          <div style={{ fontSize: 10, color: textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.user.username ? `@${c.user.username}` : c.user.role || "collaborator"}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {myCollaborators.length > 8 && (
                  <button className="hb" onClick={() => setShowCollaborators(authUser?.id)} style={{ marginTop: 10, background: "none", border: "none", color: text, fontSize: 11, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                    view all {myCollaborators.length} collaborators →
                  </button>
                )}
              </div>
              <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
                <div style={{ ...labelStyle, marginBottom: 8 }}>SKILLS</div>
                {(profile?.skills || []).length === 0
                  ? <div style={{ fontSize: 12, color: textMuted }}>no skills. <button onClick={() => setEditProfile(true)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>add →</button></div>
                  : <div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>{(profile?.skills || []).map(s => <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}</div>
                      <div style={{ fontSize: 11, color: textMuted }}>★ {forYou.length} matching project{forYou.length !== 1 ? "s" : ""} <button className="hb" onClick={() => { setAppScreen("explore"); setExploreTab("for-you"); }} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline", marginLeft: 4 }}>view →</button></div>
                  </div>
                }
              </div>

              {/* Projects */}
              <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ ...labelStyle, marginBottom: 0 }}>PROJECTS</div>
                  <button className="hb" onClick={() => setShowCreate(true)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline" }}>+ create project</button>
                </div>
                {myProjects.length === 0
                  ? <div style={{ fontSize: 13, color: textMuted, lineHeight: 1.75 }}>you haven’t posted any projects yet.<br />create your first project to showcase what you’re building.</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {[...myProjects].sort((a, b) => Number(b.featured) - Number(a.featured) || new Date(b.created_at) - new Date(a.created_at)).map((p, i, arr) => (
                        <button key={p.id} className="hb" onClick={() => { setActiveProject(p); loadProjectData(p.id); setAppScreen("workspace"); }} style={{ textAlign: "left", background: bg2, borderRadius: i === 0 && arr.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === arr.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < arr.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 16px", cursor: "pointer", fontFamily: "inherit" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5, gap: 10 }}>
                            <div style={{ fontSize: 13, color: text, fontWeight: p.featured ? 500 : 400 }}>{p.title}</div>
                            <div style={{ display: "flex", gap: 6 }}>
                              {p.featured && <span style={{ fontSize: 10, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px", color: text }}>pinned</span>}
                              <span style={{ fontSize: 10, border: `1px solid ${p.shipped ? "#22c55e66" : border}`, borderRadius: 3, padding: "1px 6px", color: p.shipped ? "#22c55e" : textMuted }}>{p.shipped ? "shipped" : "active"}</span>
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.6, marginBottom: 6 }}>{p.description?.slice(0, 120)}{(p.description || "").length > 120 ? "..." : ""}</div>
                          {(p.skills || []).length > 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{(p.skills || []).slice(0, 4).map((s) => <span key={s} style={{ fontSize: 10, padding: "1px 7px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}</div>}
                        </button>
                      ))}
                    </div>
                }
              </div>

              {/* Portfolio */}
              <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ ...labelStyle, marginBottom: 0 }}>PORTFOLIO</div>
                  <button className="hb" onClick={() => setShowAddPortfolio(true)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline" }}>+ add work</button>
                </div>
                {portfolioItems.length === 0
                  ? <div style={{ fontSize: 13, color: textMuted, lineHeight: 1.75 }}>your portfolio lives here.<br />add portfolio work so collaborators can scan your best output quickly.</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {portfolioItems.map((item, i) => (
                        <div key={item.id} style={{ background: bg2, borderRadius: i === 0 && portfolioItems.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === portfolioItems.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < portfolioItems.length - 1 ? "none" : `1px solid ${border}`, padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 14, color: text, marginBottom: 5, letterSpacing: "-0.3px" }}>{item.title}</div>
                            {item.description && <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.65, marginBottom: 6 }}>{item.description}</div>}
                            {item.url && getMediaType(item.url) === "image" && <img src={item.url} alt={item.title} style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, border: `1px solid ${border}`, marginTop: 4 }} />}
                            {item.url && getMediaType(item.url) === "youtube" && (
                              <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${border}`, marginTop: 6 }}>
                                <iframe title={item.title} src={`https://www.youtube.com/embed/${getYouTubeId(item.url) || ""}`} style={{ width: "100%", height: 220, border: "none" }} allowFullScreen />
                              </div>
                            )}
                            {item.url && getMediaType(item.url) === "link" && (
                              <a href={item.url} target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "10px 12px", marginTop: 6 }}>
                                <div style={{ fontSize: 10, color: textMuted, marginBottom: 3 }}>{toHost(item.url)}</div>
                                <div style={{ fontSize: 11, color: text, textDecoration: "underline", wordBreak: "break-all" }}>{item.url.includes("user-uploads") ? "view file" : item.url}</div>
                              </a>
                            )}
                          </div>
                          <button className="hb" onClick={() => handleDeletePortfolioItem(item.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", flexShrink: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                }
              </div>

              {/* Activity */}
              <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
                <div style={{ ...labelStyle, marginBottom: 16 }}>ACTIVITY</div>
                {applications.filter(a => a.applicant_id === authUser?.id).length === 0
                  ? <div style={{ fontSize: 12, color: textMuted }}>no activity yet.</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {applications.filter(a => a.applicant_id === authUser?.id).slice(0, 6).map(a => {
                        const p = projects.find(proj => proj.id === a.project_id);
                        return p ? (
                          <div key={a.id} style={{ padding: "10px 14px", background: bg2, borderRadius: 8, border: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                            <div><div style={{ fontSize: 12, color: text, marginBottom: 2 }}>Applied to {p.title}</div><div style={{ fontSize: 10, color: textMuted }}>{new Date(a.created_at).toLocaleDateString()}</div></div>
                            <span style={{ fontSize: 10, color: a.status === "accepted" ? text : textMuted, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>{a.status}</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                }
              </div>

              {/* Posts */}
              <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
                <div style={{ ...labelStyle, marginBottom: 16 }}>POSTS</div>
                {posts.filter(p => p.user_id === authUser?.id).length === 0
                  ? <div style={{ fontSize: 12, color: textMuted }}>no posts yet. <button className="hb" onClick={() => setAppScreen("network")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>share something →</button></div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {posts.filter(p => p.user_id === authUser?.id).slice(0, 5).map(post => (
                        <div key={post.id} style={{ padding: "12px 14px", background: bg2, borderRadius: 8, border: `1px solid ${border}` }}>
                          <div style={{ fontSize: 13, color: text, lineHeight: 1.6, marginBottom: 6 }}>{post.content}</div>
                          {post.media_url && post.media_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) && (
                            <img src={post.media_url} alt="" style={{ maxWidth: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 6, marginBottom: 6 }} />
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: textMuted }}>♥ {post.like_count || 0}</span>
                              {post.project_title && <span style={{ fontSize: 10, color: textMuted, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px" }}>↗ {post.project_title}</span>}
                            </div>
                            <span style={{ fontSize: 10, color: textMuted }}>{new Date(post.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                }
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="hb" onClick={() => setEditProfile(true)} style={btnG}>edit profile</button>
                <button className="hb" onClick={() => { if (profile?.username) { navigator.clipboard.writeText(`${window.location.origin}/u/${profile.username}`).catch(() => {}); showToast("Profile link copied!"); } else { setEditProfile(true); showToast("Set a username first →"); } }} style={btnG}>share profile ↗</button>
                <button className="hb" onClick={handleSignOut} style={{ ...btnG, color: textMuted }}>sign out</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 20 }}>EDIT PROFILE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 22 }}>
                <div><label style={labelStyle}>DISPLAY NAME</label><input style={inputStyle} value={profile?.name || ""} onChange={e => setProfile({ ...profile, name: e.target.value })} /></div>
                <div><label style={labelStyle}>USERNAME</label>
                  <div style={{ display: "flex", alignItems: "center", background: bg2, border: `1px solid ${border}`, borderRadius: 8, padding: "0 14px" }}>
                    <span style={{ fontSize: 13, color: textMuted }}>@</span>
                    <input style={{ ...inputStyle, border: "none", background: "none", padding: "10px 6px" }} value={profile?.username || ""} onChange={e => setProfile({ ...profile, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} placeholder="yourhandle" />
                  </div>
                </div>
                <div><label style={labelStyle}>ROLE</label><input style={inputStyle} placeholder="Founder, Designer, Engineer..." value={profile?.role || ""} onChange={e => setProfile({ ...profile, role: e.target.value })} /></div>
                <div><label style={labelStyle}>LOCATION</label><input style={inputStyle} placeholder="City, State or Country" value={profile?.location || ""} onChange={e => setProfile({ ...profile, location: e.target.value })} /></div>
                <div><label style={labelStyle}>BIO</label><textarea style={{ ...inputStyle, resize: "none" }} rows={4} value={profile?.bio || ""} onChange={e => setProfile({ ...profile, bio: e.target.value })} /></div>
                <div>
                  <label style={labelStyle}>SKILLS</label>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {SKILLS.map(s => { const sel = (profile?.skills || []).includes(s); return <button key={s} className="hb" onClick={() => setProfile({ ...profile, skills: sel ? profile.skills.filter(x => x !== s) : [...(profile?.skills || []), s] })} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="hb" onClick={() => setEditProfile(false)} style={btnG}>cancel</button>
                <button className="hb" onClick={handleSaveProfile} style={{ ...btnP, flex: 1 }}>save</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ADD PORTFOLIO MODAL */}
      {showAddPortfolio && (
        <div onClick={() => setShowAddPortfolio(false)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.9)" : "rgba(200,200,200,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(10px)", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "24px", width: "100%", maxWidth: 440 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 16 }}>ADD TO PORTFOLIO</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={labelStyle}>TITLE</label><input style={inputStyle} placeholder="Project or work title" value={newPortfolioItem.title} onChange={e => setNewPortfolioItem({ ...newPortfolioItem, title: e.target.value })} /></div>
              <div><label style={labelStyle}>DESCRIPTION</label><textarea style={{ ...inputStyle, resize: "none" }} rows={3} placeholder="What did you build or create?" value={newPortfolioItem.description} onChange={e => setNewPortfolioItem({ ...newPortfolioItem, description: e.target.value })} /></div>
              <div>
                <label style={labelStyle}>MEDIA / FILE</label>
                {newPortfolioItem.url && (
                  <div style={{ marginBottom: 8, position: "relative", display: "inline-block" }}>
                    {newPortfolioItem.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                      ? <img src={newPortfolioItem.url} alt="" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 8, border: `1px solid ${border}` }} />
                      : <div style={{ fontSize: 11, color: textMuted, padding: "6px 10px", background: bg2, borderRadius: 6 }}>file: {newPortfolioItem.url.split("/").pop()}</div>
                    }
                    <button onClick={() => setNewPortfolioItem({ ...newPortfolioItem, url: "" })} style={{ position: "absolute", top: 4, right: 4, background: bg, border: `1px solid ${border}`, borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", color: text, fontFamily: "inherit" }}>✕</button>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{ cursor: "pointer", flexShrink: 0 }}>
                    <div style={{ ...btnG, padding: "8px 14px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}>↑ upload file</div>
                    <input type="file" accept="image/*,.pdf,.doc,.docx,.mp4,.mov" style={{ display: "none" }} onChange={async (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      showToast("Uploading...");
                      const path = `portfolio/${authUser.id}/${Date.now()}-${file.name}`;
                      const { error } = await supabase.storage.from("user-uploads").upload(path, file);
                      if (error) { showToast("Upload failed."); return; }
                      const { data: { publicUrl } } = supabase.storage.from("user-uploads").getPublicUrl(path);
                      setNewPortfolioItem({ ...newPortfolioItem, url: publicUrl });
                      showToast("File ready.");
                    }} />
                  </label>
                  <input style={{ ...inputStyle, fontSize: 11, padding: "8px 12px" }} placeholder="or paste a URL..." value={newPortfolioItem.url} onChange={e => setNewPortfolioItem({ ...newPortfolioItem, url: e.target.value })} />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="hb" onClick={() => setShowAddPortfolio(false)} style={btnG}>cancel</button>
              <button className="hb" onClick={handleAddPortfolioItem} style={{ ...btnP, flex: 1 }}>add →</button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE PROJECT MODAL */}
      {showCreate && (
        <div onClick={() => { if (!isCreatingProject) setShowCreate(false); }} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.9)" : "rgba(200,200,200,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(10px)", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "24px", width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 12 }}>NEW PROJECT</div>
            <h2 style={{ fontSize: 20, fontWeight: 400, letterSpacing: "-1px", marginBottom: 20, color: text }}>What are you building?</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={labelStyle}>TITLE</label><input style={inputStyle} placeholder="Project name" value={newProject.title} onChange={e => { setCreateProjectError(""); setNewProject({ ...newProject, title: e.target.value }); }} /></div>
              <div><label style={labelStyle}>DESCRIPTION</label><textarea style={{ ...inputStyle, resize: "none" }} rows={4} placeholder="What are you building? What do you need?" value={newProject.description} onChange={e => { setCreateProjectError(""); setNewProject({ ...newProject, description: e.target.value }); }} /></div>
              <div><label style={labelStyle}>CATEGORY</label><select style={inputStyle} value={newProject.category} onChange={e => setNewProject({ ...newProject, category: e.target.value })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
              <div>
                <label style={labelStyle}>SKILLS NEEDED</label>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {SKILLS.map(s => { const sel = newProject.skills.includes(s); return <button key={s} className="hb" onClick={() => setNewProject({ ...newProject, skills: sel ? newProject.skills.filter(x => x !== s) : [...newProject.skills, s] })} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                </div>
              </div>
              <div><label style={labelStyle}>COLLABORATORS NEEDED</label><select style={inputStyle} value={newProject.maxCollaborators} onChange={e => setNewProject({ ...newProject, maxCollaborators: parseInt(e.target.value) })}>{[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
              <div><label style={labelStyle}>LOCATION (optional)</label><input style={inputStyle} placeholder="City, remote, or global" value={newProject.location} onChange={e => setNewProject({ ...newProject, location: e.target.value })} /></div>
              <div><label style={labelStyle}>GOALS / CHECKPOINTS (optional)</label><textarea style={{ ...inputStyle, resize: "none" }} rows={3} placeholder="What does done look like? List key milestones or deliverables..." value={newProject.goals} onChange={e => setNewProject({ ...newProject, goals: e.target.value })} /></div>
              <div><label style={labelStyle}>TIMELINE (optional)</label><input style={inputStyle} placeholder="e.g. 8 weeks, by end of Q2, 3 months..." value={newProject.timeline} onChange={e => setNewProject({ ...newProject, timeline: e.target.value })} /></div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
                <div>
                  <div style={{ fontSize: 11, color: text }}>Private project</div>
                  <div style={{ fontSize: 10, color: textMuted }}>Only visible to team members and invited people</div>
                </div>
                <button className="hb" onClick={() => setNewProject({ ...newProject, is_private: !newProject.is_private })}
                  style={{ background: newProject.is_private ? text : "none", border: `1px solid ${border}`, borderRadius: 20, padding: "3px 12px", fontSize: 10, cursor: "pointer", color: newProject.is_private ? bg : textMuted, fontFamily: "inherit" }}>
                  {newProject.is_private ? "on" : "off"}
                </button>
              </div>
              {createProjectError && (
                <div style={{ fontSize: 11, color: "#ef4444", border: `1px solid ${border}`, borderRadius: 8, padding: "8px 10px", lineHeight: 1.5 }}>
                  {createProjectError}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="hb" onClick={() => { if (isCreatingProject) return; setShowCreate(false); setCreateProjectError(""); setNewProject({ title: "", description: "", category: CATEGORIES[0], skills: [], maxCollaborators: 2, location: "", goals: "", timeline: "", is_private: false }); }} style={btnG}>cancel</button>
              <button className="hb" onClick={handlePostProject} disabled={isCreatingProject} style={{ ...btnP, flex: 1, opacity: isCreatingProject ? 0.7 : 1, cursor: isCreatingProject ? "wait" : "pointer" }}>{isCreatingProject ? "posting..." : "post →"}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: text, color: bg, padding: "11px 20px", borderRadius: 8, fontSize: 11, zIndex: 300, animation: "tin 0.3s ease", whiteSpace: "nowrap" }}>{toast}</div>}

      {showShipModal && (
        <div onClick={() => setShowShipModal(false)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.92)" : "rgba(200,200,200,0.88)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(12px)", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "28px", width: "100%", maxWidth: 460 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 8 }}>SHIP IT</div>
            <div style={{ fontSize: 18, fontWeight: 400, letterSpacing: "-0.5px", color: text, marginBottom: 6 }}>All tasks complete.</div>
            <div style={{ fontSize: 12, color: textMuted, marginBottom: 20 }}>Mark this project as shipped and share what you built with your network.</div>
            <textarea
              value={shipPostContent}
              onChange={e => setShipPostContent(e.target.value)}
              placeholder="What did you build? Who did you build it with?"
              style={{ ...inputStyle, resize: "none", minHeight: 100, fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="hb" onClick={() => setShowShipModal(false)} style={{ ...btnG, flex: 1 }}>later</button>
              <button className="hb" onClick={() => handleShipProject(activeProject?.id, shipPostContent)} style={{ ...btnP, flex: 2 }}>ship it →</button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div onClick={() => setShowSettings(false)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.92)" : "rgba(200,200,200,0.88)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(12px)", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "28px", width: "100%", maxWidth: 420 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px" }}>ACCOUNT SETTINGS</div>
              <button onClick={() => setShowSettings(false)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <div style={{ fontSize: 11, color: textMuted, letterSpacing: "1px", marginBottom: 10 }}>CHANGE EMAIL</div>
                <input placeholder="New email address" value={settingsEmail} onChange={e => setSettingsEmail(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 8 }} />
                <button className="hb" onClick={handleUpdateEmail}
                  style={{ ...btnP, width: "100%" }}>update email</button>
                <div style={{ fontSize: 10, color: textMuted, marginTop: 6 }}>You'll receive a confirmation at your new address.</div>
              </div>
              <div style={{ borderTop: `1px solid ${border}`, paddingTop: 20 }}>
                <div style={{ fontSize: 11, color: textMuted, letterSpacing: "1px", marginBottom: 10 }}>CHANGE PASSWORD</div>
                <input type="password" placeholder="New password (min 8 chars)" value={settingsNewPassword} onChange={e => setSettingsNewPassword(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 8 }} />
                <button className="hb" onClick={handleUpdatePassword}
                  style={{ ...btnP, width: "100%" }}>update password</button>
              </div>
              <div style={{ borderTop: `1px solid ${border}`, paddingTop: 20 }}>
                <div style={{ fontSize: 11, color: textMuted, letterSpacing: "1px", marginBottom: 10 }}>DANGER ZONE</div>
                <button className="hb" onClick={async () => { if (window.confirm("Sign out of all devices?")) { await signOut(); } }}
                  style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "7px 14px", fontSize: 11, cursor: "pointer", color: textMuted, fontFamily: "inherit", width: "100%" }}>
                  sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CoLab;
