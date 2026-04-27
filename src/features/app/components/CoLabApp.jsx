/* SQL MIGRATIONS TO RUN:
create table if not exists reports (
  id uuid default gen_random_uuid() primary key,
  reporter_id uuid not null,
  content_type text not null,
  content_id uuid not null,
  reason text not null,
  details text,
  created_at timestamptz default now()
);
alter table reports enable row level security;
create policy "Anyone can submit a report" on reports for insert with check (auth.uid() = reporter_id);
create policy "Reporters can view own reports" on reports for select using (auth.uid() = reporter_id);
alter table posts add column if not exists edited_at timestamptz;
alter table projects add column if not exists cover_image_url text;
alter table tasks add column if not exists priority text default 'medium';
alter table projects add column if not exists open_roles text[] default '{}';
alter table applications add column if not exists role text;
*/
import React, { useState, useEffect, useMemo, useRef } from "react";
import LandingPage from "../../landing/LandingPage";
import { supabase } from "../../../supabase";
import { AVAILABILITY, BANNER_PIXELS_COUNT, CATEGORIES, COLS, normalizeBannerPixels, PLUGINS, PRESETS, ROWS, SKILLS } from "../../../constants/appConstants";
import { initials, matchesRegion, relativeTime } from "../../../utils/appHelpers";
import Avatar from "../../../components/ui/Avatar";
import ProgressBar from "../../../components/ui/ProgressBar";
import Spinner from "../../../components/ui/Spinner";
import PixelBannerDisplay from "../../../components/ui/PixelBannerDisplay";
import NetworkGraph3D from "../../../components/ui/NetworkGraph3D";
import { useAuthBootstrap } from "../../../hooks/useAuthBootstrap";
import { signIn, signOut, signUp } from "../../../services/authService";
import { useProfileState } from "../../profile/hooks/useProfileState";
import { useAppDataBootstrap } from "../hooks/useAppDataBootstrap";
import { fetchCommunityPosts, fetchThreadComments, fetchTopCommunityPosts } from "../services/appDataBootstrapService";
import { useRealtimeSubscriptions } from "../../realtime/hooks/useRealtimeSubscriptions";
import { useMessaging } from "../../messaging/hooks/useMessaging";
import { useApplications } from "../../applications/hooks/useApplications";
import { useProjectWorkspace } from "../../projects/hooks/useProjectWorkspace";
import { computeProjectHealth, PROJECT_HEALTH, resolveTaskOwnership } from "../../projects/utils/projectHealth";

/*
SQL migrations to run before enabling project workspace files/docs features:

create table if not exists project_files (
  id uuid default gen_random_uuid() primary key,
  project_id uuid not null,
  uploader_id uuid not null,
  uploader_name text,
  file_name text not null,
  file_url text not null,
  file_size bigint,
  file_type text,
  created_at timestamptz default now()
);
alter table project_files enable row level security;
create policy "Project files readable by all" on project_files for select using (true);
create policy "Authenticated users can upload" on project_files for insert with check (auth.uid() = uploader_id);
create policy "Uploader can delete" on project_files for delete using (auth.uid() = uploader_id);

create table if not exists project_docs (
  id uuid default gen_random_uuid() primary key,
  project_id uuid unique not null,
  content text default '',
  updated_at timestamptz default now(),
  updated_by uuid,
  updated_by_name text
);
alter table project_docs enable row level security;
create policy "Docs readable by all" on project_docs for select using (true);
create policy "Authenticated users can write docs" on project_docs for insert with check (auth.uid() = updated_by);
create policy "Authenticated users can update docs" on project_docs for update using (true);
*/

const COMMUNITY_SYMBOLS = {
  'music':        '♪',
  'design':       '◈',
  'tech':         '⌨',
  'startups':     '↗',
  'film-video':   '▶',
  'writing':      '✎',
  'marketing':    '↑',
  'research':     '⊙',
  'making':       '✦',
  'photography':  '◉',
  'gaming':       '⊕',
  'education':    '≡',
  'animation':    '◌',
  'data-science': '▦',
  'podcasting':   '◎',
  'open-source':  '⊛',
  'fashion':      '◇',
  'architecture': '△',
};

const isFreshTimestamp = (timestamp, windowMs = 120000) => {
  if (!timestamp) return false;
  return Date.now() - new Date(timestamp).getTime() < windowMs;
};


const normalizeApplicationStatus = (status) => {
  if (status === "declined") return "rejected";
  return status || "pending";
};

const applicationStatusStyles = {
  pending: { label: "pending", color: "#f59e0b" },
  invited: { label: "invited", color: "#60a5fa" },
  accepted: { label: "accepted", color: "#22c55e" },
  rejected: { label: "rejected", color: "#ef4444" },
};
const PROFILE_PROJECTS_TABS = {
  owned: "owned",
  collaborated: "collaborated",
};
const CAPACITY_BADGE_STYLES = {
  "On Project": {
    background: "transparent",
    border: "1px solid #f97316",
    color: "#f97316",
    fontSize: 10,
    borderRadius: 20,
    padding: "2px 8px",
  },
  "Free to Collab": {
    background: "transparent",
    border: "1px solid #22c55e",
    color: "#22c55e",
    fontSize: 10,
    borderRadius: 20,
    padding: "2px 8px",
  },
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

const URL_REGEX = /https?:\/\/[^\s<>"]+[^\s<>.,;!?"')\]]/g;

const linkifyText = (text, linkColor, onMentionClick) => {
  if (!text) return null;
  const parts = [];
  let last = 0;
  let match;
  const re = /https?:\/\/[^\s)]+|@([a-zA-Z0-9_]+)/g;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1]) {
      const username = match[1];
      parts.push(
        <button key={match.index} onClick={(e) => { e.stopPropagation(); onMentionClick?.(username); }}
          style={{ background: "none", border: "none", color: linkColor, cursor: onMentionClick ? "pointer" : "default", padding: 0, fontFamily: "inherit", fontSize: "inherit", fontWeight: 600 }}>
          @{username}
        </button>
      );
    } else {
      parts.push(
        <a key={match.index} href={match[0]} target="_blank" rel="noopener noreferrer"
          style={{ color: linkColor, textDecoration: "underline", wordBreak: "break-all" }}
          onClick={(e) => e.stopPropagation()}>
          {match[0]}
        </a>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
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

function AudioPostPlayer({ post, bg2, text, textMuted }) {
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
    <div style={{ background: bg2, border: "none", borderRadius: 12, padding: "16px" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 12 }}>
        <button
          className="hb"
          onClick={togglePlayback}
          style={{ width: 40, height: 40, borderRadius: 999, background: text, color: bg2, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          {isPlaying
            ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4" height="16" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/></svg>
            : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l15 8-15 8V4z"/></svg>}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: textMuted, marginBottom: 4 }}>{creatorLabel}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {trackLabel || "Untitled track"}
          </div>
        </div>
      </div>

      <div
        onClick={(e) => {
          if (!audioRef.current || duration <= 0) return;
          const seekTime = (e.nativeEvent.offsetX / e.currentTarget.offsetWidth) * duration;
          audioRef.current.currentTime = seekTime;
          setCurrentTime(seekTime);
        }}
        style={{ width: "100%", position: "relative", height: 60, display: "flex", alignItems: "flex-end", gap: 2, cursor: "pointer" }}
      >
        {waveformData.length ? waveformData.map((value, index) => (
          <div
            key={`${post.id}-wave-${index}`}
            style={{
              flex: 1,
              borderRadius: 999,
              minHeight: 3,
              height: `${Math.round(value * 100)}%`,
              background: text,
              opacity: index < playedBars ? 1 : 0.25,
              transition: "opacity 0.12s linear",
            }}
          />
        )) : (
          <div style={{ width: "100%", fontSize: 10, color: textMuted }}>
            {waveformError ? "Waveform unavailable for this file." : "Building waveform..."}
          </div>
        )}
      </div>

      <div style={{ textAlign: "right", fontSize: 11, color: textMuted, marginTop: 6 }}>
        {duration > 0 ? `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, "0")}` : ""}
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

function TeamReviewModal({ project, authUser, applications, users, teamReviews, dark, bg, bg2, border, text, textMuted, btnP, btnG, onClose, onSubmit }) {
  const teammates = [
    ...(project.owner_id !== authUser?.id ? [{ id: project.owner_id, name: project.owner_name }] : []),
    ...applications
      .filter(a => a.project_id === project.id && normalizeApplicationStatus(a.status) === "accepted" && a.applicant_id !== authUser?.id)
      .map(a => { const u = users.find(u => u.id === a.applicant_id); return { id: a.applicant_id, name: u?.name || "Collaborator" }; }),
  ];
  const [ratings, setRatings] = React.useState(() => {
    const init = {};
    teammates.forEach(t => { init[t.id] = 0; });
    return init;
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const alreadyReviewed = teamReviews.some(r => r.project_id === project.id && r.reviewer_id === authUser?.id);

  const handleSubmit = async () => {
    setSubmitting(true);
    const reviews = teammates.map(t => ({ project_id: project.id, reviewer_id: authUser.id, reviewee_id: t.id, rating: ratings[t.id] || 0 }));
    await onSubmit(reviews);
    setDone(true);
    setSubmitting(false);
  };

  const GearRating = ({ userId }) => {
    const val = ratings[userId] || 0;
    return (
      <div style={{ display: "flex", gap: 2 }}>
        {[1,2,3,4,5].map(n => (
          <button key={n} onClick={() => setRatings(prev => ({ ...prev, [userId]: n === val ? 0 : n }))}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: n <= val ? text : textMuted, padding: "2px 1px", lineHeight: 1, transition: "color 0.1s" }}>
            +
          </button>
        ))}
      </div>
    );
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.92)" : "rgba(200,200,200,0.88)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(12px)", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "32px 28px", width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        {done || alreadyReviewed ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>+</div>
            <div style={{ fontSize: 18, color: text, fontWeight: 400, letterSpacing: "-0.5px", marginBottom: 8 }}>Reviews submitted.</div>
            <div style={{ fontSize: 13, color: textMuted, marginBottom: 24, lineHeight: 1.7 }}>Your ratings help surface great collaborators to the community.</div>
            <button onClick={onClose} style={{ ...btnP, padding: "10px 28px" }}>done</button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 8 }}>TEAM REVIEW</div>
              <div style={{ fontSize: 20, color: text, fontWeight: 400, letterSpacing: "-0.5px", marginBottom: 4 }}>{project.title}</div>
              <div style={{ fontSize: 13, color: textMuted, lineHeight: 1.6 }}>Rate your teammates 0–5 gears. These ratings are public and help rank top collaborators.</div>
            </div>
            {teammates.length === 0 ? (
              <div style={{ fontSize: 13, color: textMuted, marginBottom: 24 }}>No teammates to review on this project.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0, border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
                {teammates.map((t, i) => (
                  <div key={t.id} style={{ padding: "14px 16px", background: bg2, borderBottom: i < teammates.length - 1 ? `1px solid ${border}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div style={{ fontSize: 13, color: text, fontWeight: 400 }}>{t.name}</div>
                    <GearRating userId={t.id} />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose} style={{ ...btnG, flex: 1, textAlign: "center" }}>skip</button>
              <button onClick={handleSubmit} disabled={submitting} style={{ ...btnP, flex: 2, textAlign: "center", opacity: submitting ? 0.7 : 1 }}>
                {submitting ? "submitting..." : "submit reviews →"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PostCard({ post, ctx }) {
  const {
    postLikes, postReposts, expandedComments, postComments, authUser, users,
    handleDeletePost, dark, border, text, textMuted, bg2, btnP, inputStyle,
    setViewingProfile, handleLike, handleRepost, setExpandedComments, loadComments,
    myInitials, setPostComments, profile, supabase, pendingLikeIds,
    commentPulseIds, pendingCommentByPost, recentActivityByPost, justInsertedPostIds,
    markCommentPending, markRecentActivity, navigateToProject, postMenuOpenId, setPostMenuOpenId,
    openReportModal, editingFeedPostId, setEditingFeedPostId, editingFeedPostContent, setEditingFeedPostContent,
    handleSaveFeedPostEdit, showToast,
  } = ctx;
  const isLiked = (postLikes.myLikes || []).includes(post.id);
  const isReposted = (postReposts.myReposts || []).includes(post.id);
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
  const mySkillSet = React.useMemo(() => new Set(profile?.skills || []), [profile]);
  const copyPostLink = async () => {
    try {
      await navigator.clipboard.writeText(`https://collaborativelaboratories.com/post/${post.id}`);
      showToast("Link copied");
      setPostMenuOpenId(null);
    } catch {
      showToast("Couldn't copy link");
    }
  };

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
          <Avatar initials={post.user_initials} src={postUser?.avatar_url} size={40} dark={dark} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => postUser && setViewingProfile(postUser)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: text }}>{post.user_name}</span>
                </button>
                {post.user_role && <span style={{ fontSize: 11, color: textMuted }}>{post.user_role}</span>}
              </div>
              {postUser?.skills?.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4, marginBottom: 2 }}>
                  {postUser.skills.slice(0, 3).map(s => {
                    const isMatch = mySkillSet.has(s);
                    return (
                      <span key={s} style={{ fontSize: 9, color: isMatch ? text : textMuted, border: `1px solid ${isMatch ? text : border}`, borderRadius: 3, padding: "1px 7px", fontWeight: isMatch ? 500 : 400, background: isMatch ? (dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)") : "none" }}>{s}</span>
                    );
                  })}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                <div style={{ fontSize: 10, color: textMuted }}>{relativeTime(post.created_at)}</div>
                {hasRecentActivity && (
                  <span style={{ fontSize: 9, color: textMuted, border: `1px solid ${border}`, borderRadius: 20, padding: "1px 7px", background: bg2 }}>
                    live · just now
                  </span>
                )}
              </div>
            </div>
            <div style={{ position: "relative" }}>
              <button className="hb" onClick={() => setPostMenuOpenId((prev) => (prev === post.id ? null : post.id))} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>⋯</button>
              {postMenuOpenId === post.id && (
                <div style={{ position: "absolute", right: 0, top: 22, background: dark ? "#111" : "#fff", border: `1px solid ${border}`, borderRadius: 8, minWidth: 120, zIndex: 20 }}>
                  <button className="hb" onClick={copyPostLink} style={{ width: "100%", textAlign: "left", background: "none", border: "none", color: text, padding: "8px 10px", fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}>copy link</button>
                  <button className="hb" onClick={() => openReportModal({ contentType: "post", contentId: post.id, label: "post" })} style={{ width: "100%", textAlign: "left", background: "none", border: "none", color: text, padding: "8px 10px", fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}>report</button>
                  {isOwner && <button className="hb" onClick={() => { setEditingFeedPostId(post.id); setEditingFeedPostContent(post.content || ""); setPostMenuOpenId(null); }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", color: text, padding: "8px 10px", fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}>edit</button>}
                  {isOwner && <button className="hb" onClick={() => { handleDeletePost(post.id); setPostMenuOpenId(null); }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", color: "#ef4444", padding: "8px 10px", fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}>delete</button>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {editingFeedPostId === post.id ? (
        <div style={{ marginBottom: 14, paddingLeft: 52 }}>
          <textarea value={editingFeedPostContent} onChange={(e) => setEditingFeedPostContent(e.target.value)} rows={4} style={{ ...inputStyle, fontSize: 13, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="hb" onClick={() => handleSaveFeedPostEdit(post)} style={{ ...btnP, padding: "6px 12px", fontSize: 11 }}>save</button>
            <button className="hb" onClick={() => { setEditingFeedPostId(null); setEditingFeedPostContent(""); }} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, color: textMuted, padding: "6px 12px", fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 14, color: text, lineHeight: 1.75, marginBottom: 14, paddingLeft: 52, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {linkifyText(post.content, text, (username) => { const u = users.find(u => u.username === username); if (u) setViewingProfile(u); })}{post.edited_at && <span style={{ fontSize: 10, color: textMuted, marginLeft: 8 }}>(edited)</span>}
        </div>
      )}

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
            if (t === "audio") return <AudioPostPlayer post={post} bg2={bg2} text={text} textMuted={textMuted} />;
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
          <button className="hb" onClick={() => navigateToProject?.(post.project_id)}
            style={{ fontSize: 11, color: textMuted, background: bg2, border: `1px solid ${border}`, borderRadius: 20, padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: 4, cursor: navigateToProject ? "pointer" : "default", fontFamily: "inherit", transition: "opacity 0.15s" }}
            onMouseEnter={e => { if (navigateToProject) e.currentTarget.style.opacity = "0.7"; }}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
            <span style={{ fontSize: 9, opacity: 0.6 }}>↗</span> {post.project_title}
          </button>
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
          <span style={{ fontSize: 12, opacity: (post.like_count || 0) === 0 ? 0.35 : 1 }}>{post.like_count || 0}</span>
        </button>
        <button
          className="hb"
          onClick={() => handleRepost(post.id)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 13,
            color: isReposted ? text : textMuted,
            display: "flex",
            gap: 6,
            alignItems: "center",
            transition: "color 0.15s",
            fontWeight: isReposted ? 500 : 400,
          }}
        >
          ⇄
          {(post.repost_count || 0) > 0 && <span style={{ fontSize: 12 }}>{post.repost_count}</span>}
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
        <button className="hb" onClick={copyPostLink} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, color: textMuted }}>
          ↗ share
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
                    <Avatar initials={c.user_initials} src={cUser?.avatar_url} size={26} dark={dark} />
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
            <Avatar initials={myInitials} src={profile?.avatar_url} size={26} dark={dark} />
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
function MentionInput({ value, onChange, onKeyDown, placeholder, users, following = [], followers = [], inputRef, style, rows, multiline, dark, onFocus, onBlur, autoFocus }) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [mentionStart, setMentionStart] = useState(-1);
  const [activeIdx, setActiveIdx] = useState(0);
  const internalRef = useRef(null);
  const ref = inputRef || internalRef;

  const followingSet = useMemo(() => new Set(following), [following]);
  const followerSet  = useMemo(() => new Set(followers), [followers]);

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    const cursor = e.target.selectionStart;
    const textBefore = val.slice(0, cursor);
    const atIndex = textBefore.lastIndexOf("@");
    if (atIndex !== -1 && (atIndex === 0 || /\s/.test(textBefore[atIndex - 1]))) {
      const query = textBefore.slice(atIndex + 1).toLowerCase();
      if (!query.includes(" ") && query.length >= 0) {
        const matches = users
          .filter(u => {
            const uname = (u.username || "").toLowerCase();
            const name  = (u.name || "").toLowerCase();
            return uname.startsWith(query) || name.toLowerCase().startsWith(query) || uname.includes(query) || name.includes(query);
          })
          .map(u => {
            const isMutual    = followingSet.has(u.id) && followerSet.has(u.id);
            const isFollowing = followingSet.has(u.id);
            const isFollower  = followerSet.has(u.id);
            return { ...u, _priority: isMutual ? 0 : isFollowing ? 1 : isFollower ? 2 : 3 };
          })
          .sort((a, b) => a._priority - b._priority)
          .slice(0, 5);
        setSuggestions(matches);
        setShowSuggestions(matches.length > 0);
        setMentionStart(atIndex);
        setActiveIdx(0);
        return;
      }
    }
    setShowSuggestions(false);
  };

  const selectUser = (user) => {
    const handle = user.username || user.name.toLowerCase().replace(/\s+/g, "");
    const cursor = ref.current?.selectionStart ?? value.length;
    const before = value.slice(0, mentionStart);
    const after  = value.slice(cursor);
    onChange(`${before}@${handle} ${after}`);
    setShowSuggestions(false);
    setTimeout(() => ref.current?.focus(), 0);
  };

  const handleKeyDown = (e) => {
    if (showSuggestions) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" && suggestions.length > 0) { e.preventDefault(); selectUser(suggestions[activeIdx]); return; }
      if (e.key === "Escape") { setShowSuggestions(false); }
    }
    if (onKeyDown) onKeyDown(e);
  };

  const Tag = (rows || multiline) ? "textarea" : "input";
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <Tag ref={ref} value={value} onChange={handleChange} onKeyDown={handleKeyDown}
        onFocus={onFocus} onBlur={onBlur} autoFocus={autoFocus}
        placeholder={placeholder} rows={rows}
        style={{ ...style, resize: (rows || multiline) ? "none" : undefined }} />
      {showSuggestions && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 350, background: dark ? "#111" : "#fff", border: `1px solid ${dark ? "#2a2a2a" : "#e0e0e0"}`, borderRadius: 8, overflow: "hidden", marginTop: 4, minWidth: 200, boxShadow: dark ? "0 8px 24px rgba(0,0,0,0.6)" : "0 8px 24px rgba(0,0,0,0.1)" }}>
          {suggestions.map((u, i) => (
            <button key={u.id} onClick={() => selectUser(u)}
              onMouseEnter={() => setActiveIdx(i)}
              style={{ width: "100%", padding: "8px 12px", background: i === activeIdx ? (dark ? "#1c1c1c" : "#f5f5f5") : "none", border: "none", color: dark ? "#fff" : "#000", cursor: "pointer", textAlign: "left", fontSize: 12, fontFamily: "inherit", display: "flex", gap: 8, alignItems: "center" }}>
              <Avatar initials={initials(u.name)} src={u.avatar_url} size={24} dark={dark} />
              <div>
                <div style={{ fontSize: 12, color: dark ? "#fff" : "#000" }}>@{u.username || u.name}</div>
                <div style={{ fontSize: 10, color: dark ? "#555" : "#aaa" }}>
                  {u.name}{u._priority === 0 ? " · mutual" : u._priority === 1 ? " · following" : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BannerEditor({ pixels, onSave, onClose, dark, bg, border, text, textMuted }) {
  const [grid, setGrid] = React.useState(normalizeBannerPixels(pixels));
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
          <button onClick={() => { setGrid(new Array(BANNER_PIXELS_COUNT).fill(0)); setActivePreset(null); }} style={{ padding: "3px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer", fontFamily: "inherit", background: "none", color: textMuted, border: `1px solid ${border}`, marginLeft: "auto" }}>clear</button>
        </div>

        {/* Grid */}
        <div
          style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)`, width: "100%", aspectRatio: `${COLS} / ${ROWS}`, userSelect: "none", border: `1px solid ${border}`, borderRadius: 6, overflow: "hidden", cursor: "crosshair" }}
          onMouseLeave={() => setDrawing(false)}
        >
          {grid.map((v, i) => (
            <div
              key={i}
              style={{ background: v ? (dark ? "#fff" : "#000") : (dark ? "#111" : "#f5f5f5"), borderRight: `0.5px solid ${dark ? "#1a1a1a" : "#e8e8e8"}`, borderBottom: `0.5px solid ${dark ? "#1a1a1a" : "#e8e8e8"}`, boxSizing: "border-box" }}
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
  const [dark, setDark] = useState(false);
  const [screen, setScreen] = useState("landing");
  const [appScreen, setAppScreen] = useState("explore");
  const [exploreTab, setExploreTab] = useState("feed");
  const [feedSort, setFeedSort] = useState("for-you");
  const [feedPage, setFeedPage] = useState(1);
  const [composerFocused, setComposerFocused] = useState(false);
  const [composerPlaceholderIdx, setComposerPlaceholderIdx] = useState(0);
  const [hiddenFeedIds, setHiddenFeedIds] = useState(new Set());
  const [followingOnly, setFollowingOnly] = useState(false);
  const [teamReviews, setTeamReviews] = useState([]);
  const [showTeamReview, setShowTeamReview] = useState(null); // project to review
  // Communities
  const [communities, setCommunities] = useState([]);
  const [joinedCommunityIds, setJoinedCommunityIds] = useState([]);
  const [communityVotes, setCommunityVotes] = useState({}); // { postId: true }
  const [communityDownvotes, setCommunityDownvotes] = useState({}); // { postId: true }
  const [activeCommunity, setActiveCommunity] = useState(null);
  const [communityPosts, setCommunityPosts] = useState([]);
  const [communityPostsLoading, setCommunityPostsLoading] = useState(false);
  const [activeThread, setActiveThread] = useState(null);
  const [threadComments, setThreadComments] = useState({});
  const [communitySort, setCommunitySort] = useState("hot");
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [showCreateCommunity, setShowCreateCommunity] = useState(false);
  const [newThreadTitle, setNewThreadTitle] = useState("");
  const [newThreadContent, setNewThreadContent] = useState("");
  const [newCommunityName, setNewCommunityName] = useState("");
  const [newCommunityDesc, setNewCommunityDesc] = useState("");
  const [newCommunityEmoji, setNewCommunityEmoji] = useState("◈");
  const [newCommentText, setNewCommentText] = useState("");
  const [communitySearch, setCommunitySearch] = useState("");
  const [editingPostId, setEditingPostId] = useState(null);
  const [editingPostContent, setEditingPostContent] = useState("");
  const [communityPostPage, setCommunityPostPage] = useState(1);
  const [topCommunityPosts, setTopCommunityPosts] = useState([]);
  const [projectsSubTab, setProjectsSubTab] = useState("for-you");
  const [networkTab, setNetworkTab] = useState("graph");
  const [discoverSkillFilter, setDiscoverSkillFilter] = useState([]);
  const [discoverLocationFilter, setDiscoverLocationFilter] = useState("");
  const [discoverSmartMatch, setDiscoverSmartMatch] = useState(false);
  const [skillDepotSelected, setSkillDepotSelected] = useState(null); // null = grid, string = drill-in
  const [customSkillInput, setCustomSkillInput] = useState("");
  const [activeProject, setActiveProject] = useState(null);
  const [viewingProfile, setViewingProfileState] = useState(null);
  const [viewFullProfile, setViewFullProfileState] = useState(null);
  const [profileProjectsTab, setProfileProjectsTab] = useState(PROFILE_PROJECTS_TABS.owned);
  const [projectTab, setProjectTab] = useState("tasks");

  // Auth
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubMode, setAuthSubMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [verifyEmail, setVerifyEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState("");
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState(false);
  const [onboardStep, setOnboardStep] = useState(0);
  const [onboardData, setOnboardData] = useState({ name: "", username: "", role: "", bio: "", skills: [] });
  const [usernameCheckLoading, setUsernameCheckLoading] = useState(false);
  const [usernameCheckError, setUsernameCheckError] = useState("");
  const [isUsernameTaken, setIsUsernameTaken] = useState(false);

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

  const [globalSearch, setGlobalSearch] = useState("");
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [posts, setPosts] = useState([]);
  const [postLikes, setPostLikes] = useState({ myLikes: [] });
  const [postReposts, setPostReposts] = useState({ myReposts: [] });
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
  const [autoOpenComposer, setAutoOpenComposer] = useState(false);
  const [expandedComments, setExpandedComments] = useState({});

  const COMPOSER_PLACEHOLDERS = [
    "Who are you looking for?",
    "What are you building?",
    "Got a win to share?",
    "What's blocking you?",
  ];
  useEffect(() => {
    if (composerFocused) return;
    const t = setInterval(() => setComposerPlaceholderIdx(i => (i + 1) % COMPOSER_PLACEHOLDERS.length), 3000);
    return () => clearInterval(t);
  }, [composerFocused]);
  const [projectFiles, setProjectFiles] = useState([]);
  const [projectDocs, setProjectDocs] = useState([]);
  const [activeDoc, setActiveDoc] = useState(null);
  const [workspaceDoc, setWorkspaceDoc] = useState(null);
  const [workspaceDocDraft, setWorkspaceDocDraft] = useState("");
  const [workspaceDocEditing, setWorkspaceDocEditing] = useState(false);
  const [workspaceDocLoading, setWorkspaceDocLoading] = useState(false);
  const [fileUploadLoading, setFileUploadLoading] = useState(false);
  const [fileUploadProgress, setFileUploadProgress] = useState(0);
  const [filesDragActive, setFilesDragActive] = useState(false);
  const [kanbanDropZone, setKanbanDropZone] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null); // { id, text, type }
  const [editMessageText, setEditMessageText] = useState("");
  const [mentionNotifications, setMentionNotifications] = useState([]);
  const [trendingProjects, setTrendingProjects] = useState([]);


  // UI
  const [showNotifications, setShowNotifications] = useState(false);
  const [filterSkill, setFilterSkill] = useState(null);
  const [networkFilter, setNetworkFilter] = useState(null);
  const [regionFilter, setRegionFilter] = useState(null); // local, national, international
  const [industryFilter, setIndustryFilter] = useState(null);
  const [locationFilter, setLocationFilter] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newProject, setNewProject] = useState({ title: "", description: "", category: CATEGORIES[0], skills: [], openRoles: [], maxCollaborators: 2, location: "", goals: "", timeline: "", is_private: false, coverImageFile: null });
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
  const [newDocTitle, setNewDocTitle] = useState("");
  const [showNewDocInput, setShowNewDocInput] = useState(false);
  const [inviteLink, setInviteLink] = useState(null);
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [showDeployExplainer, setShowDeployExplainer] = useState(false);
  const [showShipModal, setShowShipModal] = useState(false);
  const [shareUpdateToFeed, setShareUpdateToFeed] = useState(false);
  const [shipPostContent, setShipPostContent] = useState("");
  const [githubCommits, setGithubCommits] = useState([]);
  const [githubRepoInput, setGithubRepoInput] = useState("");
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState(null);
  const [editProfile, setEditProfile] = useState(false);
  const [showBannerEditor, setShowBannerEditor] = useState(false);
  const [bannerPixels, setBannerPixels] = useState(new Array(BANNER_PIXELS_COUNT).fill(0));
  const [showApplicationForm, setShowApplicationForm] = useState(null);
  const [showNewDm, setShowNewDm] = useState(false);
  const [newDmSearch, setNewDmSearch] = useState("");
  const [dmSearchQuery, setDmSearchQuery] = useState("");
  const [showAddPortfolio, setShowAddPortfolio] = useState(false);
  const [newPortfolioItem, setNewPortfolioItem] = useState({ title: "", description: "", url: "" });
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");
  const [taskEditorTaskId, setTaskEditorTaskId] = useState(null);
  const [taskEditorDraft, setTaskEditorDraft] = useState({ assigneeId: "", dueDate: "", description: "", priority: "medium" });
  const [taskUpdatePendingById, setTaskUpdatePendingById] = useState({});
  const [hideFirstTimeGuide, setHideFirstTimeGuide] = useState(false);
  const [projectLastReadAt, setProjectLastReadAt] = useState({});
  const [exploreFiltersClearedNotice, setExploreFiltersClearedNotice] = useState(false);
  const [showCommunityDrawer, setShowCommunityDrawer] = useState(false);
  const [dismissOnboardingChecklist, setDismissOnboardingChecklist] = useState(false);
  const [dismissFirstProjectFlow, setDismissFirstProjectFlow] = useState(() => localStorage.getItem("colab_first_flow_done") === "1");
  const [hasBrowsedProjects, setHasBrowsedProjects] = useState(false);
  const [profileLinkCopied, setProfileLinkCopied] = useState(false);
  const [showCollaboratorsList, setShowCollaboratorsList] = useState(false);
  const [discoverSwipes, setDiscoverSwipes] = useState(null); // null=unloaded, Set=loaded
  const [discoverMatch, setDiscoverMatch] = useState(null); // matched user object
  const [postMenuOpenId, setPostMenuOpenId] = useState(null);
  const [communityMenuOpenId, setCommunityMenuOpenId] = useState(null);
  const [reportModal, setReportModal] = useState(null); // { contentType, contentId, label }
  const [reportReason, setReportReason] = useState("Spam");
  const [reportDetails, setReportDetails] = useState("");
  const [editingFeedPostId, setEditingFeedPostId] = useState(null);
  const [editingFeedPostContent, setEditingFeedPostContent] = useState("");
  const [showInviteUserModal, setShowInviteUserModal] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteTargetUser, setInviteTargetUser] = useState(null);
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const [coverUploading, setCoverUploading] = useState(false);

  const messagesEndRef = useRef(null);
  const dmEndRef = useRef(null);
  const taskMutationSeqRef = useRef({});
  const feedComposerRef = useRef(null);
  const composerWrapRef = useRef(null);

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

  // ── SKILL VALIDATION ──
  const BANNED_WORDS = ["fuck", "shit", "ass", "dick", "pussy", "bitch", "cunt", "cock", "whore", "slut", "nigga", "nigger", "faggot", "retard", "rape", "porn", "sex", "nude", "naked", "bastard", "damn", "hell", "crap", "piss", "jerk", "idiot", "stupid", "dumb", "loser"];
  const isSkillClean = (s) => {
    const lower = s.toLowerCase();
    return !BANNED_WORDS.some(w => lower.includes(w));
  };
  const normalizeSkill = (s) => s.trim().replace(/\s+/g, " ").replace(/\b\w/g, c => c.toUpperCase()).slice(0, 32);
  const addCustomSkill = (currentSkills, setter) => {
    const cleaned = normalizeSkill(customSkillInput);
    if (!cleaned) return;
    if (!isSkillClean(cleaned)) { showToast("That skill name isn't allowed."); return; }
    if (cleaned.length < 2) { showToast("Skill name too short."); return; }
    if (currentSkills.includes(cleaned)) { showToast("Already added."); return; }
    setter([...currentSkills, cleaned]);
    setCustomSkillInput("");
  };
const setViewingProfile = (user) => {
    setViewingProfileState(user || null);
  };
  const setViewFullProfile = (user) => {
    setViewFullProfileState(user || null);
  };

  useEffect(() => {
    setProfileProjectsTab(PROFILE_PROJECTS_TABS.owned);
  }, [viewFullProfile]);

  useEffect(() => {
    setShowCollaboratorsList(false);
  }, [viewFullProfile?.id]);
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
  const normalizedGlobalSearch = globalSearch.trim().toLowerCase();
  const peopleSearchResults = useMemo(() => {
    if (!normalizedGlobalSearch) return [];
    return users
      .filter((u) => u.id !== authUser?.id && (
        u.name?.toLowerCase().includes(normalizedGlobalSearch)
        || u.username?.toLowerCase().includes(normalizedGlobalSearch)
      ))
      .slice(0, 3);
  }, [users, authUser?.id, normalizedGlobalSearch]);
  const projectSearchResults = useMemo(() => {
    if (!normalizedGlobalSearch) return [];
    return projects
      .filter((p) => (
        p.title?.toLowerCase().includes(normalizedGlobalSearch)
        || p.description?.toLowerCase().includes(normalizedGlobalSearch)
      ))
      .slice(0, 3);
  }, [projects, normalizedGlobalSearch]);
  const communitySearchResults = useMemo(() => {
    if (!normalizedGlobalSearch) return [];
    return communities
      .filter((c) => c.name?.toLowerCase().includes(normalizedGlobalSearch))
      .slice(0, 3);
  }, [communities, normalizedGlobalSearch]);
  const getMatchScore = (p) => (profile?.skills || []).filter(s => (p.skills || []).includes(s)).length;
  const unreadDms = dmThreads.filter(t => t.unread && t.id !== activeDmThread?.id).length;
  const unreadNotifs = notifications.filter((n) => !n.read).length + mentionNotifications.length;
  const notificationGroups = useMemo(() => {
    const grouped = { replies: [], invites: [], taskAssigned: [], follows: [], applications: [], mentions: [] };
    notifications.forEach((n) => {
      if (n.type === "invite") grouped.invites.push(n);
      else if (n.type === "task_assigned") grouped.taskAssigned.push(n);
      else if (n.type === "follow") grouped.follows.push(n);
      else if (["application", "application_status"].includes(n.type)) grouped.applications.push(n);
      else if (n.type === "mention") grouped.mentions.push(n);
      else grouped.replies.push(n);
    });
    mentionNotifications.forEach((n) => grouped.mentions.push({ ...n, _source: "mention_notifications" }));
    return grouped;
  }, [notifications, mentionNotifications]);
  const markAllNotificationsRead = async () => {
    if (!authUser?.id) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", authUser.id);
    await loadAllData(authUser.id);
  };
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

  const shouldShowPluginsTab = Boolean(activeProject?.owner_id === authUser?.id || activeProject?.github_repo || (activeProject?.plugins || []).length > 0);

  useEffect(() => {
    if (projectTab === "plugins" && !shouldShowPluginsTab) {
      setProjectTab("kanban");
    }
  }, [projectTab, shouldShowPluginsTab]);

  useEffect(() => {
    if (!activeProject?.id || projectTab !== "docs") return;
    let cancelled = false;
    const loadWorkspaceDoc = async () => {
      setWorkspaceDocLoading(true);
      const { data } = await supabase.from("project_docs").select("*").eq("project_id", activeProject.id).maybeSingle();
      if (cancelled) return;
      setWorkspaceDoc(data || null);
      setWorkspaceDocDraft(data?.content || "");
      setWorkspaceDocEditing(false);
      setWorkspaceDocLoading(false);
    };
    loadWorkspaceDoc();
    return () => { cancelled = true; };
  }, [activeProject?.id, projectTab]);

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

  const discoverQueue = React.useMemo(() => {
    if (!discoverSwipes || !authUser) return [];
    // Projects I own or am an accepted member of
    const myProjectIds = new Set([
      ...projects.filter(p => p.owner_id === authUser.id).map(p => p.id),
      ...applications.filter(a => a.applicant_id === authUser.id && a.status === "accepted").map(a => a.project_id),
    ]);
    // People already on those projects (collaborators)
    const collaboratorIds = new Set(
      applications
        .filter(a => myProjectIds.has(a.project_id) && a.status === "accepted" && a.applicant_id !== authUser.id)
        .map(a => a.applicant_id)
    );
    projects.filter(p => myProjectIds.has(p.id) && p.owner_id !== authUser.id).forEach(p => collaboratorIds.add(p.owner_id));
    return users.filter(u =>
      u.id !== authUser.id &&
      !discoverSwipes.has(u.id) &&
      !following.includes(u.id) &&
      !collaboratorIds.has(u.id) &&
      u.name?.trim()
    );
  }, [users, discoverSwipes, authUser, following, applications, projects]);

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
      if (updates.assigned_to && updates.assigned_to !== previousTask.assigned_to && updates.assigned_to !== authUser?.id && activeProject?.id) {
        await supabase.from("notifications").insert({
          user_id: updates.assigned_to,
          type: "task_assigned",
          text: `You've been assigned a task in ${activeProject.title}: ${data.text}`,
          entity_id: data.id,
          project_id: activeProject.id,
          read: false,
        });
      }
    }
    setTaskUpdatePendingById((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const moveTaskToColumn = async (taskId, columnId) => {
    const updateByColumn = {
      todo: { in_progress: false, done: false },
      inprogress: { in_progress: true, done: false },
      done: { in_progress: false, done: true },
    };
    const updates = updateByColumn[columnId];
    if (!updates) return;
    await updateTaskOptimistic(taskId, updates);
  };

  const formatFileSize = (size = 0) => {
    if (!size || Number.isNaN(Number(size))) return "—";
    const kb = Number(size) / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  };

  const fileTypeBadge = (fileType = "", fileName = "") => {
    const lowerType = String(fileType || "").toLowerCase();
    const lowerName = String(fileName || "").toLowerCase();
    if (lowerType.includes("pdf") || lowerName.endsWith(".pdf")) return "[PDF]";
    if (lowerType.startsWith("image/")) return "[IMG]";
    if (lowerType.includes("word") || /\.(doc|docx|txt|rtf)$/i.test(lowerName)) return "[DOC]";
    if (lowerType.startsWith("video/")) return "[VID]";
    if (lowerType.includes("zip") || /\.(zip|rar|7z|tar|gz)$/i.test(lowerName)) return "[ZIP]";
    return "[FILE]";
  };

  const openTaskEditor = (task) => {
    if (!task) return;
    setTaskEditorTaskId(task.id);
    setTaskEditorDraft({
      assigneeId: task.assigned_to || "",
      dueDate: task.due_date || "",
      description: task.description || "",
      priority: task.priority || "medium",
    });
  };

  // Render mentions with highlights
  const renderWithMentions = (text) => {
    if (!text) return text;
    const parts = text.split(/(@\w[\w\s]*)/g);
    return parts.map((part, i) => {
      if (!part.startsWith("@")) return part;
      const handle = part.slice(1).trim().toLowerCase();
      const mentionedUser = users.find(u => (u.username || u.name || "").toLowerCase() === handle);
      return (
        <span
          key={i}
          style={{ color: dark ? "#fff" : "#000", fontWeight: 600, cursor: mentionedUser ? "pointer" : "default" }}
          onClick={() => mentionedUser && setViewFullProfile(mentionedUser)}
        >{part}</span>
      );
    });
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
      .profile-banner-card { min-height: 140px !important; }
      .profile-banner-canvas { height: 140px !important; }
    }
    .community-drawer-toggle { display: none; }
    @media (max-width: 768px) {
      .desktop-nav-items { display: none !important; }
      .app-shell { padding-bottom: 58px !important; }
      .mobile-tabbar { display: flex !important; }
      .feed-layout, .projects-layout { display: block !important; max-width: 100% !important; gap: 0 !important; }
      .feed-right-sidebar, .projects-right-sidebar { display: none !important; }
      .msgs-left { width: 100% !important; border-right: none !important; }
      .msgs-right { width: 100% !important; }
      .msgs-has-thread .msgs-left { display: none !important; }
      .msgs-no-thread .msgs-right { display: none !important; }
      .msgs-back { display: flex !important; }
      .community-drawer-toggle { display: flex !important; }
      .communities-wrap { position: relative; }
      .communities-sidebar {
        position: fixed !important;
        top: 50px;
        bottom: 0;
        left: 0;
        z-index: 230;
        width: min(88vw, 280px) !important;
        background: ${bg};
        transform: translateX(-105%);
        transition: transform 0.2s ease;
      }
      .communities-sidebar.open { transform: translateX(0); }
      .communities-main { width: 100% !important; }
      .community-main-inner { padding: 20px 16px !important; }
      .profile-modal-overlay { padding: 0 !important; }
      .profile-modal-card {
        max-width: 100% !important;
        max-height: 100vh !important;
        height: 100vh !important;
        border-radius: 0 !important;
        border-left: none !important;
        border-right: none !important;
      }
      .pad { padding-left: 16px !important; padding-right: 16px !important; }
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
    setPostReposts,
    setMentionNotifications,
    setTrendingProjects,
    setNotifications,
    setShowApplicationForm,
    setTeamReviews,
    setCommunities,
    setJoinedCommunityIds,
    setCommunityVotes,
    setCommunityDownvotes,
  });


  useAuthBootstrap({
    setAuthUser,
    setProfile,
    setBannerPixels,
    setVerifyEmail,
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

  useEffect(() => {
    if (networkTab !== "discover" || discoverSwipes !== null || !authUser?.id) return;
    supabase.from("swipes").select("swiped_id").eq("swiper_id", authUser.id)
      .then(({ data }) => setDiscoverSwipes(new Set((data || []).map(s => s.swiped_id))));
  }, [networkTab, discoverSwipes, authUser?.id]);


  useRealtimeSubscriptions({
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
    if (!agreedToTerms) { setAuthError("Please agree to the Legal Notice before creating an account."); return; }
    const { data, error } = await signUp({ email: authEmail, password: authPassword });
    if (error) { setAuthError(error.message); return; }
    const needsVerification = data.user && (
      (Array.isArray(data.user.identities) && data.user.identities.length === 0)
      || !data.user.email_confirmed_at
      || !data.session
    );
    if (needsVerification) { setVerifyEmail(data.user.email || authEmail); setScreen("verify"); return; }
    if (data.user) { setAuthUser(data.user); setScreen("onboard"); }
  };

  const handleLogin = async () => {
    setAuthError("");
    const { error } = await signIn({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
  };

  const handlePasswordReset = async () => {
    setAuthError("");
    if (!authEmail) { setAuthError("Enter your email first."); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(authEmail, {
      redirectTo: "https://www.collaborativelaboratories.com",
    });
    if (error) setAuthError(error.message);
    else setResetSent(true);
  };

  const handleSignOut = async () => {
    await signOut();
    setProfile(null); setProjects([]); setUsers([]); setFollowing([]);
    setScreen("landing");
  };

  const handleSetNewPassword = async () => {
    setResetPasswordError("");
    if (!resetPasswordValue || resetPasswordValue.length < 8) {
      setResetPasswordError("Enter a new password with at least 8 characters.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: resetPasswordValue });
    if (error) {
      setResetPasswordError(error.message);
      return;
    }
    setResetPasswordSuccess(true);
    setResetPasswordValue("");
    setAuthSubMode("login");
  };

  useEffect(() => {
    if (screen !== "onboard" || onboardStep !== 1) return;
    const usernameValue = (onboardData.username || "").trim();
    if (!usernameValue || usernameValue.length < 3) {
      setUsernameCheckLoading(false);
      setUsernameCheckError("");
      setIsUsernameTaken(false);
      return;
    }
    setUsernameCheckLoading(true);
    setUsernameCheckError("");
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", usernameValue)
        .maybeSingle();
      if (error) {
        setUsernameCheckError("Could not validate username right now.");
        setIsUsernameTaken(false);
      } else {
        setIsUsernameTaken(Boolean(data));
        setUsernameCheckError(Boolean(data) ? "Username taken." : "");
      }
      setUsernameCheckLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [onboardData.username, onboardStep, screen]);

  const resolveCommunitySlug = async (name) => {
    const baseSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data } = await supabase.from("communities").select("id").eq("slug", baseSlug).maybeSingle();
    if (!data) return baseSlug;
    return `${baseSlug}-${Math.floor(Math.random() * 9) + 2}`;
  };

  const handleFinishOnboard = async () => {
    if (!onboardData.name) return;
    if (isUsernameTaken || usernameCheckError) return;
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
    if (!userId || userId === authUser?.id) return;
    if (following.includes(userId)) {
      await supabase.from("follows").delete().eq("follower_id", authUser.id).eq("following_id", userId);
      setFollowing(prev => prev.filter(id => id !== userId));
      showToast("Unfollowed.");
    } else {
      await supabase.from("follows").insert({ follower_id: authUser.id, following_id: userId });
      await supabase.from("notifications").insert({
        user_id: userId,
        type: "follow",
        text: `${profile.name || "Someone"} followed you`,
        entity_id: authUser.id,
        project_id: null,
        read: false,
      });
      setFollowing(prev => [...prev, userId]);
      showToast("Following!");
    }
  };

  const handleSwipe = async (direction, user) => {
    setDiscoverSwipes(prev => new Set([...(prev || []), user.id]));
    await supabase.from("swipes").upsert({ swiper_id: authUser.id, swiped_id: user.id, direction }, { onConflict: "swiper_id,swiped_id" });
    if (direction === "like") {
      const { data } = await supabase.from("swipes").select("id")
        .eq("swiper_id", user.id).eq("swiped_id", authUser.id).eq("direction", "like").maybeSingle();
      if (data) setDiscoverMatch(user);
    }
  };

  const myProjects = projects.filter(p => p.owner_id === authUser?.id && !p.archived);

  const userRatings = useMemo(() => {
    const map = {};
    teamReviews.forEach(r => {
      if (!map[r.reviewee_id]) map[r.reviewee_id] = { sum: 0, count: 0 };
      map[r.reviewee_id].sum += r.rating;
      map[r.reviewee_id].count += 1;
    });
    return map;
  }, [teamReviews]);

  const shippedCollabCount = useMemo(() => {
    const counts = {};
    projects.filter(p => p.shipped).forEach(p => { counts[p.owner_id] = (counts[p.owner_id] || 0) + 1; });
    applications.filter(a => normalizeApplicationStatus(a.status) === "accepted").forEach(a => {
      const proj = projects.find(p => p.id === a.project_id);
      if (proj?.shipped) counts[a.applicant_id] = (counts[a.applicant_id] || 0) + 1;
    });
    return counts;
  }, [projects, applications]);

  const autoFeaturedProjects = useMemo(() => {
    const now = Date.now();
    return projects
      .filter(p => !p.archived && !p.is_private && !p.shipped)
      .map(p => {
        const appCount = applications.filter(a => a.project_id === p.id).length;
        const ageMs = now - new Date(p.created_at).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        const freshness = Math.max(0, 30 - ageDays) / 30; // 1.0 = brand new, 0.0 = 30+ days old
        const skillBreadth = (p.skills_needed || []).length;
        const ownerRating = userRatings[p.owner_id]?.count > 0
          ? (userRatings[p.owner_id].sum / userRatings[p.owner_id].count)
          : 0;
        const score = appCount * 2 + freshness * 10 + skillBreadth * 0.3 + ownerRating * 0.5;
        return { ...p, _featuredScore: score };
      })
      .sort((a, b) => b._featuredScore - a._featuredScore)
      .slice(0, 3);
  }, [projects, applications, userRatings]);

  const myPosts = posts.filter((p) => p.user_id === authUser?.id);
  const hasNoProfileActivity = myProjects.length === 0 && myPosts.length === 0;
  const suggestedConnectUsers = useMemo(() => {
    const mySkills = new Set(profile?.skills || []);
    const alreadyFollowing = new Set(following);
    return users
      .filter((u) => u.id !== authUser?.id && !alreadyFollowing.has(u.id))
      .map((u) => ({ ...u, _score: (u.skills || []).filter((s) => mySkills.has(s)).length }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 3);
  }, [users, authUser?.id, profile?.skills, following]);

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
  const createdAtMs = profile?.created_at ? new Date(profile.created_at).getTime() : 0;
  const isNewSignup = Boolean(createdAtMs) && (Date.now() - createdAtMs) < (24 * 60 * 60 * 1000);
  const onboardingChecklist = [
    { id: "profile", label: "Complete your profile", done: Boolean((profile?.name || "").trim() && (profile?.bio || "").trim() && (profile?.skills || []).length > 0), onClick: () => setAppScreen("profile") },
    { id: "community", label: "Join a community", done: joinedCommunityIds.length > 0, onClick: () => setAppScreen("communities") },
    { id: "projects", label: "Browse open projects", done: hasBrowsedProjects, onClick: () => { setAppScreen("explore"); setExploreTab("projects"); } },
    { id: "follow", label: "Follow someone", done: following.length > 0, onClick: () => { setAppScreen("network"); setNetworkTab("discover"); } },
  ];
  const basicSetupDone = onboardingChecklist.every((item) => item.done);
  const shouldShowOnboardingChecklist = isNewSignup && !basicSetupDone && !dismissOnboardingChecklist;
  const [showCollaborators, setShowCollaborators] = useState(null); // userId whose collaborators to show
  const [showProjectsFor, setShowProjectsFor] = useState(null); // userId whose projects to show
  const [showFollowList, setShowFollowList] = useState(null); // "followers" | "following"
  const appliedProjectIds = applications.filter(a => a.applicant_id === authUser?.id && a.status !== "left").map(a => a.project_id);
  const browseBase = projects.filter(p => p.owner_id !== authUser?.id && !p.archived && !p.is_private);
  const forYou = browseBase.map(p => ({ ...p, _s: getMatchScore(p) })).filter(p => p._s > 0).sort((a, b) => b._s - a._s);
  const normalizedSearch = search.trim().toLowerCase();
  const normalizedLocation = locationFilter.trim().toLowerCase();
  const localRegion = (profile?.location || "").split(",")[0].trim().toLowerCase();
  const allP = browseBase
    .map((p) => ({ ...p, _s: getMatchScore(p) }))
    .filter((p) => {
      const locationMatches = !normalizedLocation || (p.location || "").toLowerCase().includes(normalizedLocation);
      const searchableText = [p.title, p.description, ...(p.skills || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const searchMatches = !normalizedSearch || searchableText.includes(normalizedSearch);
      const pLoc = (p.location || "").toLowerCase();
      const myCountry = (profile?.location || "").split(",").pop().trim().toLowerCase();
      const regionMatches = !regionFilter || (() => {
        if (regionFilter === "local" || regionFilter === "city") return localRegion.length > 0 && pLoc.includes(localRegion);
        if (regionFilter === "national") return pLoc.includes("us") || pLoc.includes("usa") || pLoc.includes("united states") || (myCountry && pLoc.split(",").pop().trim() === myCountry);
        if (regionFilter === "international") return myCountry ? !pLoc.includes(myCountry) : false;
        return true;
      })();

      return (!filterSkill || (p.skills || []).includes(filterSkill))
        && (!industryFilter || p.category === industryFilter)
        && locationMatches
        && searchMatches
        && regionMatches;
    })
    .sort((a, b) => b._s - a._s);

  const trendingFallbackProjects = useMemo(() => {
    const hasExplicitStatus = projects.some((project) => typeof project.status === "string" && project.status.trim().length > 0);
    const openStatusSet = new Set(["open", "active", "in_progress", "in-progress"]);
    const now = Date.now();
    const candidates = browseBase
      .filter((project) => {
        if (hasExplicitStatus) return openStatusSet.has((project.status || "").toLowerCase());
        return !project.archived;
      })
      .map((project) => ({
        ...project,
        _applicantCount: applications.filter((application) => application.project_id === project.id).length,
        _recentBoost: project.created_at && (now - new Date(project.created_at).getTime()) <= 7 * 24 * 60 * 60 * 1000 ? 2 : 0,
      }))
      .map((project) => ({ ...project, _trendScore: project._applicantCount + project._recentBoost }));

    const hasAnyTimestamps = candidates.some((project) => Boolean(project.created_at));
    const scored = [...candidates].sort((a, b) => b._trendScore - a._trendScore);
    if (!hasAnyTimestamps) {
      return scored
        .slice(0, 10)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
    }
    return scored.slice(0, 3);
  }, [applications, browseBase, projects]);

  const acceptedCollaboratorCountByProject = useMemo(() => (
    applications.reduce((acc, application) => {
      if (application.status !== "accepted") return acc;
      acc[application.project_id] = (acc[application.project_id] || 0) + 1;
      return acc;
    }, {})
  ), [applications]);

  const getProfileProjects = (profileUserId) => {
    const ownedProjects = [...projects.filter((project) => project.owner_id === profileUserId)]
      .sort((a, b) => Number(b.featured) - Number(a.featured) || new Date(b.created_at) - new Date(a.created_at));

    const collaboratedProjectsById = new Map();
    applications
      .filter((application) => application.applicant_id === profileUserId && application.status === "accepted")
      .forEach((application) => {
        const project = projects.find((candidate) => candidate.id === application.project_id);
        if (!project || project.owner_id === profileUserId || collaboratedProjectsById.has(project.id)) return;
        collaboratedProjectsById.set(project.id, project);
      });
    const collaboratedProjects = [...collaboratedProjectsById.values()]
      .sort((a, b) => Number(b.featured) - Number(a.featured) || new Date(b.created_at) - new Date(a.created_at));

    return {
      ownedProjects,
      collaboratedProjects,
      activeProjects: profileProjectsTab === PROFILE_PROJECTS_TABS.collaborated ? collaboratedProjects : ownedProjects,
    };
  };
  const getCapacityStatus = (userId) => {
    const hasActiveProjects = projects.some((project) => project.owner_id === userId && !project.archived);
    const hasAcceptedApplications = applications.some((application) => application.applicant_id === userId && application.status === "accepted");
    return hasActiveProjects || hasAcceptedApplications ? "On Project" : "Free to Collab";
  };
  const viewedProfileProjects = useMemo(
    () => (viewFullProfile?.id ? getProfileProjects(viewFullProfile.id) : { ownedProjects: [], collaboratedProjects: [], activeProjects: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewFullProfile?.id, projects, applications, profileProjectsTab]
  );
  const myProfileProjects = useMemo(
    () => getProfileProjects(authUser?.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authUser?.id, projects, applications, profileProjectsTab]
  );

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
    setDismissOnboardingChecklist(localStorage.getItem("colab_onboarding_dismissed") === "true");
  }, []);

  useEffect(() => {
    if (appScreen === "explore" && exploreTab === "projects") setHasBrowsedProjects(true);
  }, [appScreen, exploreTab]);

  // Load top community posts for feed when joined communities change
  useEffect(() => {
    if (joinedCommunityIds.length === 0) { setTopCommunityPosts([]); return; }
    fetchTopCommunityPosts(joinedCommunityIds).then(posts => setTopCommunityPosts(posts));
  }, [joinedCommunityIds.join(",")]);

  useEffect(() => {
    if (!activeProject?.id) return;
    setProjectLastReadAt((prev) => (prev[activeProject.id] ? prev : { ...prev, [activeProject.id]: Date.now() }));
  }, [activeProject?.id]);

  useEffect(() => {
    if (!activeProject?.id || projectTab !== "messages") return;
    setProjectLastReadAt((prev) => ({ ...prev, [activeProject.id]: Date.now() }));
  }, [activeProject?.id, messages.length, projectTab]);

  useEffect(() => {
    const shouldAutoOpen = appScreen === "explore"
      && exploreTab === "feed"
      && posts.length === 0;
    setAutoOpenComposer(shouldAutoOpen);
  }, [appScreen, exploreTab, posts.length]);

  useEffect(() => {
    const handler = (e) => {
      if (composerWrapRef.current && !composerWrapRef.current.contains(e.target)) {
        setComposerFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!newPostContent || newPostMediaUrl) return;
    const ytMatch = newPostContent.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?[^\s]*v=|youtu\.be\/)([a-zA-Z0-9_-]{11})[^\s]*/);
    if (ytMatch) { setNewPostMediaUrl(ytMatch[0]); setNewPostMediaType("youtube"); }
  }, [newPostContent]);

  useEffect(() => {
    if (!exploreFiltersClearedNotice) return undefined;
    const timeoutId = setTimeout(() => setExploreFiltersClearedNotice(false), 3000);
    return () => clearTimeout(timeoutId);
  }, [exploreFiltersClearedNotice]);

  const dismissFirstTimeGuide = () => {
    if (authUser?.id) localStorage.setItem(`onboarding-guide-dismissed:${authUser.id}`, "true");
    setHideFirstTimeGuide(true);
  };

  const openCreateProjectFlow = () => {
    setAppScreen("workspace");
    setActiveProject(null);
    setShowCreate(true);
  };

  const clearExploreFilters = () => {
    setFilterSkill(null);
    setIndustryFilter(null);
    setLocationFilter("");
    setSearch("");
    setRegionFilter(null);
    setExploreFiltersClearedNotice(true);
  };

  const openJoinProjectFlow = () => {
    setAppScreen("explore");
    setActiveProject(null);
    setExploreTab("projects");
    setProjectsSubTab("all");
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
          {p.cover_image_url && (
            <img src={p.cover_image_url} alt={`${p.title} cover`} style={{ width: "100%", height: 86, objectFit: "cover", borderRadius: 8, border: `1px solid ${border}`, marginBottom: 10 }} />
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <button onClick={e => { e.stopPropagation(); if (owner) setViewingProfile(owner); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <Avatar initials={p.owner_initials} src={owner?.avatar_url} size={20} dark={dark} />
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
            {(p.open_roles || []).map((role) => <span key={`role-${p.id}-${role}`} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, border: `1px solid ${border}`, color: textMuted }}>role: {role}</span>)}
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
    const userCollabCount = applications.filter(a => a.applicant_id === u.id && normalizeApplicationStatus(a.status) === "accepted").length;
    const totalProjectCount = userProjects.length + userCollabCount;
    const capacityStatus = getCapacityStatus(u.id);
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
          <div style={{ position: "relative", flexShrink: 0 }}>
            <Avatar initials={initials(u.name)} src={u.avatar_url} size={44} dark={dark} />
            <span style={{ position: "absolute", top: 1, right: 1, width: 7, height: 7, borderRadius: "50%", background: capacityStatus === "On Project" ? "#f97316" : "#22c55e", border: `1.5px solid ${bg2}` }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: text, lineHeight: 1.2 }}>{u.name}</div>
              {isRecentlyActive && <span style={{ fontSize: 9, color: textMuted, border: `1px solid ${border}`, borderRadius: 20, padding: "1px 7px" }}>active</span>}
            </div>
            <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{u.role || "Builder"}</div>
            {u.location && <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>{u.location}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, color: textMuted, marginTop: 5 }}>
              <span>{totalProjectCount} project{totalProjectCount !== 1 ? "s" : ""}</span>
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
      <div className="profile-modal-overlay" style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.88)" : "rgba(220,220,220,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150, backdropFilter: "blur(10px)", padding: 16 }} onClick={onClose}>
        <div className="profile-modal-card" style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "32px 28px", width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", cursor: "pointer" }} onClick={() => { setViewFullProfile(u); onClose(); }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px" }}>PROFILE</div>
            <button onClick={e => { e.stopPropagation(); onClose(); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
            <Avatar initials={uInitials} src={u?.avatar_url} size={52} dark={dark} />
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
              <div><label style={labelStyle}>APPLYING AS</label>
                <select style={inputStyle} value={applicationForm.role || ""} onChange={e => setApplicationForm({ ...applicationForm, role: e.target.value })}>
                  <option value="">Select role...</option>
                  {(project.open_roles || []).map((r) => <option key={r} value={r}>{r}</option>)}
                  <option value="Other">Other</option>
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
                        <Avatar initials={a.applicant_initials} src={users.find(u => u.id === a.applicant_id)?.avatar_url} size={36} dark={dark} />
                        <div>
                          <div style={{ fontSize: 13, color: text, fontWeight: 500 }}>{a.applicant_name}</div>
                          <div style={{ fontSize: 11, color: textMuted }}>{a.applicant_role} · {a.availability}{a.role ? ` · applying as ${a.role}` : ""}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: textMuted }}>view →</div>
                    </div>
                  ))}
                </div>
              : <div>
                  <button onClick={() => setSelectedApplicant(null)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, marginBottom: 20 }}>← all applicants</button>
                  <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
                    <Avatar initials={selectedApplicant.applicant_initials} src={users.find(u => u.id === selectedApplicant.applicant_id)?.avatar_url} size={48} dark={dark} />
                    <div>
                      <div style={{ fontSize: 18, color: text }}>{selectedApplicant.applicant_name}</div>
                      <div style={{ fontSize: 12, color: textMuted }}>{selectedApplicant.applicant_role}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                    {selectedApplicant.availability && <div><div style={labelStyle}>AVAILABILITY</div><div style={{ fontSize: 13, color: text }}>{selectedApplicant.availability}</div></div>}
                    {selectedApplicant.role && <div><div style={labelStyle}>APPLYING AS</div><div style={{ fontSize: 13, color: text }}>{selectedApplicant.role}</div></div>}
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
    const alreadyNotified = new Set();
    for (const mention of mentioned) {
      const name = mention.slice(1).trim();
      const mentionedUser = users.find(u => u.name.toLowerCase() === name.toLowerCase());
      if (mentionedUser && mentionedUser.id !== authUser?.id && !alreadyNotified.has(mentionedUser.id)) {
        alreadyNotified.add(mentionedUser.id);
        await supabase.from("mention_notifications").insert({
          user_id: mentionedUser.id, from_name: profile.name,
          from_initials: myInitials, context: text.slice(0, 80),
          project_id: projectId, read: false,
        });
        await supabase.from("notifications").insert({
          user_id: mentionedUser.id,
          type: "mention",
          text: `${authUser?.user_metadata?.display_name || profile?.name || "Someone"} mentioned you in project chat`,
          entity_id: projectId,
          project_id: projectId,
          read: false,
        });
      }
    }
  };

  const openReportModal = ({ contentType, contentId, label }) => {
    setReportModal({ contentType, contentId, label });
    setReportReason("Spam");
    setReportDetails("");
    setPostMenuOpenId(null);
    setCommunityMenuOpenId(null);
  };

  const submitReport = async () => {
    if (!reportModal || !authUser?.id) return;
    const payload = {
      reporter_id: authUser.id,
      content_type: reportModal.contentType,
      content_id: reportModal.contentId,
      reason: reportReason,
      details: reportDetails.trim() || null,
      created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("reports").insert(payload);
    if (error) {
      showToast("Couldn't submit report. Please try again.");
      return;
    }
    showToast("Report submitted. Thank you.");
    setReportModal(null);
  };

  const handleSaveFeedPostEdit = async (post) => {
    const newContent = editingFeedPostContent.trim();
    if (!newContent) return;
    const editedAt = new Date().toISOString();
    const { error } = await supabase
      .from("posts")
      .update({ content: newContent, edited_at: editedAt })
      .eq("id", post.id)
      .eq("user_id", authUser.id);
    if (error) {
      showToast("Could not save post edits.");
      return;
    }
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, content: newContent, edited_at: editedAt } : p)));
    setEditingFeedPostId(null);
    setEditingFeedPostContent("");
    showToast("Post updated.");
  };

  const filteredInviteUsers = useMemo(() => {
    if (!activeProject || !showInviteUserModal) return [];
    const term = inviteSearch.trim().toLowerCase();
    const acceptedIds = new Set(applications.filter((a) => a.project_id === activeProject.id && a.status === "accepted").map((a) => a.applicant_id));
    const invitedIds = new Set(applications.filter((a) => a.project_id === activeProject.id && a.status === "invited").map((a) => a.applicant_id));
    return users
      .filter((u) => u.id !== activeProject.owner_id && u.id !== authUser?.id && !acceptedIds.has(u.id) && !invitedIds.has(u.id))
      .filter((u) => !term || (u.name || "").toLowerCase().includes(term) || (u.username || "").toLowerCase().includes(term))
      .slice(0, 20);
  }, [activeProject, applications, authUser?.id, inviteSearch, showInviteUserModal, users]);

  const confirmDirectInvite = async () => {
    if (!activeProject || !inviteTargetUser) return;
    const createdAt = new Date().toISOString();
    const { data, error } = await supabase.from("applications").insert({
      project_id: activeProject.id,
      applicant_id: inviteTargetUser.id,
      applicant_name: inviteTargetUser.name,
      applicant_initials: initials(inviteTargetUser.name),
      applicant_role: inviteTargetUser.role || "",
      applicant_bio: inviteTargetUser.bio || "",
      applicant_skills: inviteTargetUser.skills || [],
      status: "invited",
      created_at: createdAt,
    }).select().single();
    if (error) {
      showToast("Could not send invite.");
      return;
    }
    if (data) setApplications((prev) => [data, ...prev]);
    await supabase.from("notifications").insert({
      user_id: inviteTargetUser.id,
      type: "invite",
      text: `You've been invited to join ${activeProject.title}`,
      entity_id: activeProject.id,
      project_id: activeProject.id,
      read: false,
    });
    setShowInviteUserModal(false);
    setInviteTargetUser(null);
    setInviteSearch("");
    showToast("Invite sent.");
  };

  const handleInviteResponse = async (notif, status) => {
    const projectId = notif.project_id || notif.projectId || notif.entity_id;
    if (!projectId || !authUser?.id) return;
    const { data: app } = await supabase
      .from("applications")
      .select("*")
      .eq("project_id", projectId)
      .eq("applicant_id", authUser.id)
      .eq("status", "invited")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!app?.id) return;
    await supabase.from("applications").update({ status }).eq("id", app.id);
    setApplications((prev) => prev.map((a) => (a.id === app.id ? { ...a, status } : a)));
    await supabase.from("notifications").update({ read: true }).eq("id", notif.id);
    setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
    showToast(status === "accepted" ? "Invite accepted." : "Invite declined.");
  };

  const handleUploadProjectCover = async (project, file) => {
    if (!project?.id || !file) return;
    setCoverUploading(true);
    const path = `project-covers/${project.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("user-uploads").upload(path, file, { upsert: true });
    if (uploadError) {
      setCoverUploading(false);
      showToast("Cover upload failed.");
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("user-uploads").getPublicUrl(path);
    await supabase.from("projects").update({ cover_image_url: publicUrl }).eq("id", project.id);
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, cover_image_url: publicUrl } : p)));
    if (activeProject?.id === project.id) setActiveProject((prev) => ({ ...prev, cover_image_url: publicUrl }));
    setCoverUploading(false);
    showToast("Cover image updated.");
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
    setFollowers,
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
    newTaskPriority,
    setNewTaskPriority,
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
    dmTypingUser,
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
    const tempId = `temp-${Date.now()}`;
    const optimisticPost = {
      id: tempId,
      user_id: authUser.id,
      user_name: profile.name,
      user_initials: myInitials,
      user_role: profile.role || "",
      content: newPostContent,
      project_id: proj?.id || null,
      project_title: proj?.title || null,
      media_url: newPostMediaUrl || null,
      media_type: newPostMediaType || null,
      created_at: new Date().toISOString(),
    };
    setPosts((prev) => [optimisticPost, ...prev]);
    setNewPostContent("");
    setNewPostProject("");
    setNewPostMediaUrl("");
    setNewPostMediaType("");
    const insertPayload = {
      user_id: authUser.id,
      user_name: profile.name,
      user_initials: myInitials,
      user_role: profile.role || "",
      content: optimisticPost.content,
      project_id: proj?.id || null,
      project_title: proj?.title || null,
      media_url: optimisticPost.media_url,
      media_type: optimisticPost.media_type,
    };
    let { data, error } = await supabase.from("posts").insert(insertPayload).select().single();
    // If media_type column doesn't exist yet, retry without it
    if (error && error.message?.includes("media_type")) {
      delete insertPayload.media_type;
      ({ data, error } = await supabase.from("posts").insert(insertPayload).select().single());
    }
    if (error) {
      setPosts((prev) => prev.filter((post) => post.id !== tempId));
      showToast(`Post failed: ${error.message}`);
      return;
    }
    if (data) {
      // Attach media_type locally even if not in DB yet
      setPosts((prev) => prev.map((post) => (post.id === tempId ? { ...data, media_type: optimisticPost.media_type || null } : post)));
      registerInsertedPost(data.id);
      markRecentActivity(data.id);
      showToast("Posted.");
    }
  };

  const handleAssignRole = async (projectId, userId, role) => {
    await supabase.from("project_members").upsert({
      project_id: projectId, user_id: userId, role,
    }, { onConflict: "project_id,user_id" });
    showToast(`Role updated to ${role}.`);
  };

  const handleMarkProjectCompleted = async (projectId) => {
    const project = projects.find((entry) => entry.id === projectId);
    if (!project || project.shipped) return;
    const updatePayload = { status: "completed", progress: 100, completed_at: new Date().toISOString() };
    const { error } = await supabase.from("projects").update(updatePayload).eq("id", projectId);
    if (error) {
      showToast("Could not mark project as completed.");
      return;
    }
    setProjects((prev) => prev.map((entry) => (entry.id === projectId ? { ...entry, ...updatePayload } : entry)));
    setActiveProject((prev) => (prev?.id === projectId ? { ...prev, ...updatePayload } : prev));
    showToast("Project marked as completed. Ready to ship.");
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

  const handleRepost = async (postId) => {
    const previousMyReposts = [...(postReposts.myReposts || [])];
    const previousPost = posts.find((p) => p.id === postId);
    const previousCount = previousPost?.repost_count || 0;
    const isReposted = previousMyReposts.includes(postId);
    const nextMyReposts = isReposted
      ? previousMyReposts.filter((id) => id !== postId)
      : [...previousMyReposts, postId];
    const nextCount = isReposted
      ? Math.max(0, previousCount - 1)
      : previousCount + 1;

    markRecentActivity(postId);
    setPostReposts({ myReposts: nextMyReposts });
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, repost_count: nextCount } : p)));

    try {
      if (isReposted) {
        const { error } = await supabase.from("post_reposts").delete().eq("user_id", authUser.id).eq("post_id", postId);
        if (error) throw error;
      } else {
        const { data: repostRow, error } = await supabase.from("post_reposts").insert({ user_id: authUser.id, post_id: postId }).select().single();
        if (error) throw error;
        const targetPost = posts.find((entry) => entry.id === postId);
        if (targetPost?.user_id === authUser.id) {
          setNotifications((prev) => [{
            id: `repost:${repostRow?.id || `${authUser.id}-${postId}`}`,
            entityId: repostRow?.id || `${authUser.id}-${postId}`,
            type: "repost",
            text: "You reposted your own post",
            sub: targetPost.content ? targetPost.content.slice(0, 68) : "",
            time: "just now",
            read: false,
            postId,
          }, ...prev]);
        }
      }
    } catch (error) {
      setPostReposts({ myReposts: previousMyReposts });
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, repost_count: previousCount } : p)));
      showToast(`Repost sync failed: ${error?.message || "Retrying may help."}`);
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

    return (
      <div className="pad fu" style={{ width: "100%", padding: "48px 32px" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 10 }}>NETWORK</div>
          <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 400, letterSpacing: "-1.5px", color: text, marginBottom: 8 }}>Your network.</h2>
          <p style={{ fontSize: 13, color: textMuted }}>Your collaborators, connections, and people worth meeting.</p>
        </div>

        {/* Tabs: graph | discover */}
        <div style={{ borderBottom: `1px solid ${border}`, marginBottom: 28, display: "flex" }}>
          {[
            { id: "graph", label: "people" },
            { id: "discover", label: "discover" },
            { id: "skills", label: "skills" },
          ].map(({ id, label }) => (
            <button key={id} onClick={() => setNetworkTab(id)} style={{ background: "none", border: "none", borderBottom: networkTab === id ? `1px solid ${text}` : "1px solid transparent", color: networkTab === id ? text : textMuted, padding: "8px 0", fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginRight: 24, transition: "all 0.15s", display: "inline-flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
              {label}
            </button>
          ))}
        </div>

        {/* Feed tabs — moved to Explore */}
        {false && (
          <div>
            <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 14, padding: "18px", marginBottom: 32 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <Avatar initials={myInitials} src={profile?.avatar_url} size={40} dark={dark} />
                <div style={{ flex: 1 }}>
                  <textarea
                    ref={feedComposerRef}
                    placeholder="Looking for collaborators or building something? Post it."
                    value={newPostContent}
                    onChange={e => setNewPostContent(e.target.value)}
                    rows={(newPostContent || autoOpenComposer) ? 4 : 2}
                    style={{ ...inputStyle, resize: "none", fontSize: 13, padding: "10px 14px", background: bg3, borderColor: "transparent", lineHeight: 1.65, transition: "height 0.15s" }}
                  />
                  {(newPostContent.trim() || autoOpenComposer) && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                      {/* Media preview */}
                      {newPostMediaUrl && (
                        <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
                          {newPostMediaType === "audio" ? (
                            <div style={{ fontSize: 11, color: text, padding: "8px 12px", background: bg3, borderRadius: 8, display: "flex", gap: 6, alignItems: "center" }}>
                              audio: {newPostMediaUrl.split("/").pop().split("?")[0]}
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
                          <div>Nothing here yet — be the first to post</div>
                          {suggestedConnectUsers.length > 0 && (
                            <div style={{ marginTop: 2 }}>
                              <div style={{ fontSize: 11, color: textMuted, marginBottom: 6 }}>People you may want to connect with</div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {suggestedConnectUsers.map((user) => (
                                  <button key={user.id} className="hb" onClick={() => setViewFullProfile(user)} style={{ ...btnG, padding: "6px 10px", fontSize: 11 }}>
                                    {user.username ? `@${user.username}` : user.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>}
                  </div>
                : visibleFeed.map(post => <PostCard key={post.id} post={post} ctx={postCtx} />);
            })()}
          </div>
        )}

        {/* DISCOVER TAB */}
        {networkTab === "discover" && (() => {
          const mySkills = profile?.skills || [];

          // All users except self (not filtered by swipe history — full directory)
          const allOtherUsers = users.filter(u => u.id !== authUser?.id && u.name?.trim());

          // Apply filters
          let displayUsers = allOtherUsers;
          if (discoverSkillFilter.length > 0) {
            displayUsers = displayUsers.filter(u =>
              discoverSkillFilter.every(s => (u.skills || []).includes(s))
            );
          }
          if (discoverLocationFilter.trim()) {
            const loc = discoverLocationFilter.trim().toLowerCase();
            displayUsers = displayUsers.filter(u =>
              (u.location || "").toLowerCase().includes(loc)
            );
          }

          // Smart match: sort by shared skill count (descending)
          if (discoverSmartMatch) {
            displayUsers = [...displayUsers].sort((a, b) => {
              const aMatch = (a.skills || []).filter(s => mySkills.includes(s)).length;
              const bMatch = (b.skills || []).filter(s => mySkills.includes(s)).length;
              return bMatch - aMatch;
            });
          }

          // Unique locations for suggestions
          const allLocations = [...new Set(allOtherUsers.map(u => u.location).filter(Boolean))].sort();

          // Popular skills across all users
          const skillFreq = {};
          allOtherUsers.forEach(u => (u.skills || []).forEach(s => { skillFreq[s] = (skillFreq[s] || 0) + 1; }));
          const popularSkills = Object.entries(skillFreq).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([s]) => s);

          return (
            <div>
              {/* Header */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 8 }}>DISCOVER</div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h2 style={{ fontSize: "clamp(22px, 3.5vw, 36px)", fontWeight: 400, lineHeight: 1.05, letterSpacing: "-1.5px", color: text, marginBottom: 4 }}>Find your people.</h2>
                    <p style={{ fontSize: 12, color: textMuted, lineHeight: 1.7 }}>{allOtherUsers.length} builders on CoLab — browse, filter, or let us match you.</p>
                  </div>
                  <button
                    onClick={() => {
                      setDiscoverSmartMatch(v => !v);
                      setDiscoverSkillFilter([]);
                      setDiscoverLocationFilter("");
                    }}
                    style={{
                      padding: "9px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
                      background: discoverSmartMatch ? text : "none",
                      color: discoverSmartMatch ? bg : text,
                      border: `1px solid ${discoverSmartMatch ? text : border}`,
                    }}
                  >
                    {discoverSmartMatch ? "smart match on" : "find my match"}
                  </button>
                </div>
              </div>

              {/* Smart match banner */}
              {discoverSmartMatch && (
                <div style={{ background: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", border: `1px solid ${border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: textMuted, lineHeight: 1.6 }}>
                  {mySkills.length > 0
                    ? <>Sorted by shared skills with you — <span style={{ color: text }}>{mySkills.slice(0, 3).join(", ")}{mySkills.length > 3 ? ` +${mySkills.length - 3} more` : ""}</span>.</>
                    : "Add skills to your profile to get better matches."}
                </div>
              )}

              {/* Filters */}
              {!discoverSmartMatch && (
                <div style={{ marginBottom: 20 }}>
                  {/* Location filter */}
                  <div style={{ marginBottom: 12 }}>
                    <input
                      value={discoverLocationFilter}
                      onChange={e => setDiscoverLocationFilter(e.target.value)}
                      placeholder="filter by location..."
                      style={{ width: "100%", background: bg2, border: `1px solid ${border}`, borderRadius: 8, padding: "9px 14px", fontSize: 12, color: text, outline: "none", fontFamily: "inherit" }}
                      list="discover-locations"
                    />
                    <datalist id="discover-locations">
                      {allLocations.map(l => <option key={l} value={l} />)}
                    </datalist>
                  </div>
                  {/* Skill chips */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {popularSkills.map(s => {
                      const active = discoverSkillFilter.includes(s);
                      return (
                        <button key={s} onClick={() => setDiscoverSkillFilter(prev => active ? prev.filter(x => x !== s) : [...prev, s])}
                          style={{ fontSize: 10, padding: "4px 11px", borderRadius: 999, cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit",
                            background: active ? text : "none", color: active ? bg : textMuted, border: `1px solid ${active ? text : border}` }}>
                          {s}
                        </button>
                      );
                    })}
                    {(discoverSkillFilter.length > 0 || discoverLocationFilter) && (
                      <button onClick={() => { setDiscoverSkillFilter([]); setDiscoverLocationFilter(""); }}
                        style={{ fontSize: 10, padding: "4px 11px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", background: "none", color: textMuted, border: `1px solid ${border}`, opacity: 0.6 }}>
                        clear
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Results count */}
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 14 }}>
                {displayUsers.length} {displayUsers.length === 1 ? "person" : "people"}{discoverSkillFilter.length > 0 || discoverLocationFilter ? " matching filters" : ""}
              </div>

              {/* User grid */}
              {discoverSwipes === null ? (
                <div style={{ fontSize: 12, color: textMuted, padding: "32px 0" }}>loading...</div>
              ) : displayUsers.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                  <div style={{ fontSize: 13, color: text, marginBottom: 6 }}>no one matches those filters.</div>
                  <button onClick={() => { setDiscoverSkillFilter([]); setDiscoverLocationFilter(""); }} style={{ fontSize: 11, color: textMuted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>clear filters</button>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                  {displayUsers.map(u => {
                    const sharedSkills = mySkills.length > 0 ? (u.skills || []).filter(s => mySkills.includes(s)) : [];
                    const isFollowing = following.includes(u.id);
                    return (
                      <div key={u.id} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                        {/* Top row */}
                        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <button onClick={() => setViewingProfile(u)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                            <Avatar initials={initials(u.name)} src={u.avatar_url} size={44} dark={dark} />
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <button onClick={() => setViewingProfile(u)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", display: "block", width: "100%" }}>
                              <div style={{ fontSize: 14, color: text, letterSpacing: "-0.3px", marginBottom: 2, fontFamily: "inherit" }}>{u.name}</div>
                              <div style={{ fontSize: 11, color: textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {u.role}{u.location ? ` · ${u.location}` : ""}
                              </div>
                            </button>
                          </div>
                          {discoverSmartMatch && sharedSkills.length > 0 && (
                            <div style={{ fontSize: 10, color: text, border: `1px solid ${border}`, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>
                              {sharedSkills.length} match
                            </div>
                          )}
                        </div>

                        {/* Bio */}
                        {u.bio && (
                          <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.65, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {u.bio}
                          </div>
                        )}

                        {/* Skills */}
                        {(u.skills || []).length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {(u.skills || []).slice(0, 4).map(s => (
                              <span key={s} style={{ fontSize: 10, padding: "2px 9px", borderRadius: 999, border: `1px solid ${sharedSkills.includes(s) && discoverSmartMatch ? text : border}`, color: sharedSkills.includes(s) && discoverSmartMatch ? text : textMuted }}>
                                {s}
                              </span>
                            ))}
                            {(u.skills || []).length > 4 && <span style={{ fontSize: 10, color: textMuted }}>+{u.skills.length - 4}</span>}
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                          <button
                            onClick={() => {
                              if (!isFollowing) { handleFollow(u.id); handleSwipe("like", u); }
                            }}
                            style={{ flex: 1, padding: "7px 0", fontSize: 11, borderRadius: 7, cursor: isFollowing ? "default" : "pointer", fontFamily: "inherit", transition: "all 0.15s",
                              background: isFollowing ? "none" : text, color: isFollowing ? textMuted : bg, border: `1px solid ${isFollowing ? border : text}` }}>
                            {isFollowing ? "following" : "follow"}
                          </button>
                          <button
                            onClick={() => setViewingProfile(u)}
                            style={{ flex: 1, padding: "7px 0", fontSize: 11, borderRadius: 7, cursor: "pointer", fontFamily: "inherit", background: "none", color: text, border: `1px solid ${border}`, transition: "all 0.15s" }}>
                            view profile
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Graph tab */}
        {networkTab === "graph" && (
          <div style={{ margin: "0 -40px" }}>
            <NetworkGraph3D
              users={users}
              applications={applications}
              projects={projects}
              authUser={authUser}
              dark={dark}
              following={following}
              followers={followers}
              onFollow={handleFollow}
              onNodeClick={(user) => {
                setViewingProfile(user);
              }}
              onProjectNodeClick={(project) => {
                setActiveProject(project);
                setAppScreen("workspace");
              }}
            />
          </div>
        )}

        {/* SKILLS DEPOT TAB */}
        {networkTab === "skills" && (() => {
          const peopleBySkill = {};
          const projectsBySkill = {};
          const allSkillNames = new Set(SKILLS);
          users.forEach(u => (u.skills || []).forEach(s => { allSkillNames.add(s); peopleBySkill[s] = (peopleBySkill[s] || 0) + 1; }));
          projects.filter(p => !p.archived && !p.is_private).forEach(p => (p.skills || []).forEach(s => { allSkillNames.add(s); projectsBySkill[s] = (projectsBySkill[s] || 0) + 1; }));
          const sortedSkills = [...allSkillNames].sort((a, b) => {
            const aTotal = (peopleBySkill[a] || 0) + (projectsBySkill[a] || 0);
            const bTotal = (peopleBySkill[b] || 0) + (projectsBySkill[b] || 0);
            return bTotal - aTotal || a.localeCompare(b);
          });

          if (skillDepotSelected) {
            const s = skillDepotSelected;
            const skillPeople = users.filter(u => u.id !== authUser?.id && (u.skills || []).includes(s) && u.name?.trim());
            const skillProjects = projects.filter(p => (p.skills || []).includes(s) && !p.archived && !p.is_private);
            return (
              <div>
                <button onClick={() => setSkillDepotSelected(null)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, padding: 0, marginBottom: 20 }}>← all skills</button>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 8 }}>SKILL</div>
                <h2 style={{ fontSize: "clamp(24px, 4vw, 40px)", fontWeight: 400, letterSpacing: "-2px", color: text, marginBottom: 6 }}>{s}</h2>
                <p style={{ fontSize: 12, color: textMuted, marginBottom: 28 }}>{skillPeople.length} builder{skillPeople.length !== 1 ? "s" : ""} · {skillProjects.length} project{skillProjects.length !== 1 ? "s" : ""}</p>
                {skillPeople.length > 0 && (
                  <div style={{ marginBottom: 32 }}>
                    <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 14 }}>BUILDERS</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {skillPeople.map(u => {
                        const isFollowing = following.includes(u.id);
                        return (
                          <div key={u.id} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                            <button onClick={() => setViewingProfile(u)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                              <Avatar initials={initials(u.name)} src={u.avatar_url} size={36} dark={dark} />
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <button onClick={() => setViewingProfile(u)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                                <div style={{ fontSize: 13, color: text, letterSpacing: "-0.3px" }}>{u.name}</div>
                              </button>
                              <div style={{ fontSize: 11, color: textMuted }}>{u.role}{u.location ? ` · ${u.location}` : ""}</div>
                            </div>
                            <button onClick={() => !isFollowing && handleSwipe("like", u)}
                              style={{ fontSize: 11, padding: "5px 14px", borderRadius: 6, cursor: isFollowing ? "default" : "pointer", fontFamily: "inherit", transition: "all 0.15s",
                                background: isFollowing ? "none" : text, color: isFollowing ? textMuted : bg, border: `1px solid ${isFollowing ? border : text}` }}>
                              {isFollowing ? "following" : "follow"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {skillProjects.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 14 }}>PROJECTS NEEDING THIS SKILL</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {skillProjects.map(p => (
                        <div key={p.id} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 10, padding: "14px 16px", cursor: "pointer" }}
                          onClick={() => { setActiveProject(p); loadProjectData(p.id); setAppScreen("explore"); setExploreTab("projects"); setSkillDepotSelected(null); }}>
                          <div style={{ fontSize: 13, color: text, letterSpacing: "-0.3px", marginBottom: 4 }}>{p.title}</div>
                          <div style={{ fontSize: 11, color: textMuted, marginBottom: 8 }}>{p.owner_name} · {p.category}</div>
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {(p.skills || []).map(sk => (
                              <span key={sk} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, border: `1px solid ${sk === s ? text : border}`, color: sk === s ? text : textMuted }}>{sk}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {skillPeople.length === 0 && skillProjects.length === 0 && (
                  <div style={{ fontSize: 13, color: textMuted, padding: "32px 0" }}>No builders or projects using this skill yet.</div>
                )}
              </div>
            );
          }

          return (
            <div>
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 8 }}>SKILLS DEPOT</div>
                <h2 style={{ fontSize: "clamp(22px, 3.5vw, 38px)", fontWeight: 400, lineHeight: 1.05, letterSpacing: "-1.5px", color: text, marginBottom: 6 }}>The skill glossary.</h2>
                <p style={{ fontSize: 12, color: textMuted, lineHeight: 1.75 }}>Every skill on CoLab — tap one to see who has it and which projects need it.</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                {sortedSkills.map(s => {
                  const pCount = peopleBySkill[s] || 0;
                  const prCount = projectsBySkill[s] || 0;
                  const hasMe = (profile?.skills || []).includes(s);
                  return (
                    <button key={s} onClick={() => setSkillDepotSelected(s)}
                      style={{ background: bg2, border: `1px solid ${hasMe ? text : border}`, borderRadius: 10, padding: "16px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all 0.15s" }}>
                      <div style={{ fontSize: 13, color: text, letterSpacing: "-0.3px", marginBottom: 8 }}>{s}{hasMe ? " ★" : ""}</div>
                      <div style={{ fontSize: 10, color: textMuted }}>{pCount} builder{pCount !== 1 ? "s" : ""}</div>
                      <div style={{ fontSize: 10, color: textMuted }}>{prCount} project{prCount !== 1 ? "s" : ""}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}
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
    <LandingPage
      dark={dark}
      setDark={setDark}
      onLogin={() => { setAuthSubMode("login"); setAuthError(""); setResetSent(false); setScreen("auth"); }}
      onSignup={() => { setAuthSubMode("signup"); setAuthError(""); setResetSent(false); setScreen("auth"); }}
      supabase={supabase}
    />
  );

  if (screen === "reset-password") return (
    <div style={{ minHeight: "100vh", width: "100%", background: bg, color: text, fontFamily: "'DM Mono', monospace", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <style>{CSS}</style>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 14 }}>RESET PASSWORD</div>
        <h2 style={{ fontSize: 26, fontWeight: 400, letterSpacing: "-1px", marginBottom: 28, color: text }}>Set a new password.</h2>
        {resetPasswordSuccess ? (
          <div style={{ fontSize: 13, color: textMuted, lineHeight: 1.7 }}>
            Password updated. You can now log in with your new password.
            <div style={{ marginTop: 20 }}>
              <button onClick={() => { setResetPasswordSuccess(false); setScreen("auth"); }} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>
                Go to login
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>NEW PASSWORD</label>
              <input
                style={inputStyle}
                type="password"
                placeholder="At least 8 characters"
                value={resetPasswordValue}
                onChange={(e) => setResetPasswordValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSetNewPassword()}
              />
            </div>
            {resetPasswordError && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 14 }}>{resetPasswordError}</div>}
            <button className="hb" onClick={handleSetNewPassword} style={{ ...btnP, width: "100%", padding: "13px", marginBottom: 16 }}>
              Update password →
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // ── AUTH ──
  if (screen === "auth") return (
    <div style={{ minHeight: "100vh", width: "100%", background: bg, color: text, fontFamily: "'DM Mono', monospace", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <style>{CSS}</style>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <button onClick={() => setScreen("landing")} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, marginBottom: 32 }}>← back</button>
        <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 14 }}>{authSubMode === "signup" ? "CREATE ACCOUNT" : authSubMode === "forgot" ? "RESET PASSWORD" : "WELCOME BACK"}</div>
        <h2 style={{ fontSize: 26, fontWeight: 400, letterSpacing: "-1px", marginBottom: 28, color: text }}>
          {authSubMode === "signup" ? "Join CoLab." : authSubMode === "forgot" ? "Reset your password." : "Log in."}
        </h2>
        {authSubMode === "forgot" ? (
          resetSent ? (
            <div style={{ fontSize: 13, color: textMuted, lineHeight: 1.7 }}>
              Check your email for a reset link.
              <div style={{ marginTop: 20 }}>
                <button onClick={() => { setAuthSubMode("login"); setResetSent(false); setAuthError(""); }} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>← back to login</button>
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
              <button onClick={() => { setAuthSubMode("login"); setAuthError(""); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>← back to login</button>
            </div>
          )
        ) : (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              <div><label style={labelStyle}>EMAIL</label><input style={inputStyle} type="email" placeholder="you@example.com" value={authEmail} onChange={e => setAuthEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && (authSubMode === "signup" ? handleSignUp() : handleLogin())} /></div>
              <div><label style={labelStyle}>PASSWORD</label><input style={inputStyle} type="password" placeholder="••••••••" value={authPassword} onChange={e => setAuthPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && (authSubMode === "signup" ? handleSignUp() : handleLogin())} /></div>
            </div>
            {authSubMode === "signup" && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 18 }}>
                <input type="checkbox" id="terms-agree" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)}
                  style={{ marginTop: 2, flexShrink: 0, cursor: "pointer", accentColor: text }} />
                <label htmlFor="terms-agree" style={{ fontSize: 11, color: textMuted, lineHeight: 1.6, cursor: "pointer" }}>
                  I have read and agree to CoLab's{" "}
                  <button onClick={() => setShowLegalModal(true)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline", padding: 0 }}>
                    Legal Notice & Terms
                  </button>
                  {" "}(<a href="/terms" target="_blank" rel="noreferrer" style={{ color: text }}>Terms</a> · <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: text }}>Privacy</a>)
                </label>
              </div>
            )}
            {authError && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 14 }}>{authError}</div>}
            <button className="hb" onClick={authSubMode === "signup" ? handleSignUp : handleLogin}
              style={{ ...btnP, width: "100%", padding: "13px", marginBottom: 16, opacity: authSubMode === "signup" && !agreedToTerms ? 0.5 : 1 }}>
              {authSubMode === "signup" ? "Create account →" : "Log in →"}
            </button>
            {authSubMode === "login" && (
              <button onClick={() => { setAuthSubMode("forgot"); setAuthError(""); setResetSent(false); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline", marginBottom: 16, padding: 0 }}>
                Forgot password?
              </button>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: textMuted }}>
                {authSubMode === "signup" ? "Already have an account?" : "Don't have an account?"}
                <button onClick={() => { setAuthSubMode(authSubMode === "signup" ? "login" : "signup"); setAuthError(""); setResetSent(false); setAgreedToTerms(false); }} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline", marginLeft: 6 }}>
                  {authSubMode === "signup" ? "Log in" : "Sign up"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legal Notice Modal */}
      {showLegalModal && (
        <div onClick={() => setShowLegalModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(8px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, width: "100%", maxWidth: 600, maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "24px 28px 16px", borderBottom: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 10, letterSpacing: "2px", color: textMuted }}>LEGAL NOTICE & USER ACKNOWLEDGMENT</div>
              <button onClick={() => setShowLegalModal(false)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 18, fontFamily: "inherit", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", padding: "24px 28px", flex: 1, fontSize: 12, color: text, lineHeight: 1.8 }}>
              <p style={{ color: textMuted, marginBottom: 20 }}>Welcome to CoLab. Before creating an account and using our platform, please carefully review the following legal notice. By proceeding with registration, you acknowledge that you have read, understood, and agreed to be bound by these terms.</p>

              {[
                ["1. Acceptance of Terms", "By signing up for CoLab, you agree to comply with and be legally bound by our Terms of Service, Privacy Policy, and any additional guidelines or policies that may be posted from time to time. If you do not agree, you must not use the platform."],
                ["2. Eligibility", "You must be at least 18 years old, or the age of legal majority in your jurisdiction, to create an account. By registering, you represent and warrant that you meet this requirement."],
                ["3. User Responsibilities", "You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree not to: provide false or misleading information; violate any applicable laws or regulations; infringe upon the rights of others; or upload or distribute harmful, abusive, or unauthorized content."],
                ["4. Privacy & Data Use", "By signing up, you consent to the collection, use, and storage of your information as outlined in our Privacy Policy. CoLab may process personal data to provide and improve its services."],
                ["5. Intellectual Property", "All content, trademarks, logos, and intellectual property associated with CoLab remain the property of CoLab or its licensors. Unauthorized use is strictly prohibited."],
                ["6. Limitation of Liability", "To the fullest extent permitted by law, CoLab shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform."],
                ["7. Termination", "CoLab reserves the right to suspend or terminate your account at its discretion, without prior notice, if you violate these terms or engage in prohibited conduct."],
                ["8. Modifications", "CoLab may update this notice and related policies at any time. Continued use of the platform constitutes acceptance of any changes."],
                ["9. Governing Law", "This agreement shall be governed by and construed in accordance with the laws of the applicable jurisdiction in which CoLab operates."],
              ].map(([title, body]) => (
                <div key={title} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 10, letterSpacing: "1.5px", color: textMuted, marginBottom: 6 }}>{title.toUpperCase()}</div>
                  <div>{body}</div>
                </div>
              ))}

              <div style={{ borderTop: `1px solid ${border}`, paddingTop: 16, marginTop: 8, fontSize: 11, color: textMuted, fontStyle: "italic" }}>
                By clicking "Create account" or creating an account, you confirm that you have read and agree to this Legal Notice and all associated policies.
              </div>
            </div>
            <div style={{ padding: "16px 28px", borderTop: `1px solid ${border}`, flexShrink: 0, display: "flex", gap: 10 }}>
              <button className="hb" onClick={() => { setAgreedToTerms(true); setShowLegalModal(false); }} style={{ ...btnP, flex: 1, padding: "11px" }}>I agree →</button>
              <button className="hb" onClick={() => setShowLegalModal(false)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "11px 20px", cursor: "pointer", fontFamily: "inherit", fontSize: 12, color: textMuted }}>close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── ONBOARDING ──
  if (screen === "verify") return (
    <div style={{ minHeight: "100vh", width: "100%", background: bg, color: text, fontFamily: "'DM Mono', monospace", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <style>{CSS}</style>
      <div style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 20 }}>✉</div>
        <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 14 }}>CHECK YOUR EMAIL</div>
        <h2 style={{ fontSize: 24, fontWeight: 400, letterSpacing: "-1px", marginBottom: 16, color: text }}>Confirm your account.</h2>
        <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.7, marginBottom: 28 }}>
          We sent a confirmation link to <strong style={{ color: text }}>{verifyEmail || authEmail}</strong>.<br />
          Click it to activate your account, then come back and log in.
        </p>
        <button
          className="hb"
          onClick={async () => {
            const email = verifyEmail || authEmail;
            if (!email) return;
            const { error } = await supabase.auth.resend({ type: "signup", email });
            if (error) showToast(error.message);
            else showToast("Confirmation email resent.");
          }}
          style={{ ...btnG, width: "100%", padding: "12px", marginBottom: 12 }}
        >
          resend email
        </button>
        <button className="hb" onClick={() => { setScreen("auth"); setAuthSubMode("login"); setAuthError(""); }}
          style={{ ...btnP, width: "100%", padding: "13px", marginBottom: 14 }}>
          go to login →
        </button>
        <div style={{ fontSize: 11, color: textMuted }}>Didn't get it? Check your spam folder.</div>
      </div>
    </div>
  );

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
    const canNext = step.field === "skills"
      ? onboardData.skills.length > 0
      : step.type === "username"
        ? (onboardData.username || "").length >= 3 && !isUsernameTaken && !usernameCheckLoading
        : (onboardData[step.field] || "").trim().length > 0;
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
                <div style={{ fontSize: 11, color: usernameCheckError ? "#ef4444" : textMuted }}>
                  {usernameCheckLoading ? "checking availability..." : usernameCheckError || "lowercase letters, numbers, underscores only"}
                </div>
              </div>
            )}
            {step.type === "textarea" && <textarea autoFocus style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "12px", color: text, fontSize: 13, width: "100%", fontFamily: "inherit", outline: "none", resize: "none", lineHeight: 1.7 }} rows={4} placeholder={step.placeholder} value={onboardData[step.field] || ""} onChange={e => setOnboardData({ ...onboardData, [step.field]: e.target.value })} />}
            {step.type === "skills" && (
              <div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {SKILLS.map(s => { const sel = onboardData.skills.includes(s); return <button key={s} className="hb" onClick={() => setOnboardData({ ...onboardData, skills: sel ? onboardData.skills.filter(x => x !== s) : [...onboardData.skills, s] })} style={{ padding: "6px 14px", borderRadius: 4, fontSize: 12, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                  {/* Custom skills added during onboarding */}
                  {onboardData.skills.filter(s => !SKILLS.includes(s)).map(s => (
                    <button key={s} className="hb" onClick={() => setOnboardData({ ...onboardData, skills: onboardData.skills.filter(x => x !== s) })}
                      style={{ padding: "6px 14px", borderRadius: 4, fontSize: 12, cursor: "pointer", fontFamily: "inherit", background: text, color: bg, border: `1px solid ${text}` }}>
                      {s} ✕
                    </button>
                  ))}
                </div>
                {/* Add custom skill */}
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  <input
                    value={customSkillInput}
                    onChange={e => setCustomSkillInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addCustomSkill(onboardData.skills, (newSkills) => setOnboardData({ ...onboardData, skills: newSkills }))}
                    placeholder="not listed? type it here..."
                    style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "8px 12px", color: text, fontSize: 12, fontFamily: "inherit", outline: "none", flex: 1 }}
                  />
                  <button className="hb" onClick={() => addCustomSkill(onboardData.skills, (newSkills) => setOnboardData({ ...onboardData, skills: newSkills }))}
                    style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: text }}>+ add</button>
                </div>
                <div style={{ fontSize: 11, color: onboardData.skills.length === 0 ? text : textMuted }}>
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
    { id: "communities", label: "communities" },
    { id: "messages", label: "msgs", badge: unreadDms },
    { id: "profile", label: profile?.username ? `@${profile.username}` : profile?.name?.split(" ")[0]?.toLowerCase() || "me" },
  ];

  return (
    <div className="app-shell" style={{ minHeight: "100vh", width: "100%", background: bg, color: text, fontFamily: "'DM Mono', monospace", transition: "background-color 0.3s ease, color 0.3s ease", overflowX: "hidden" }}>
      <style>{CSS}</style>

      {/* NAV */}
      <nav className="app-nav" style={{ position: "sticky", top: 0, zIndex: 50, width: "100%", background: dark ? "rgba(10,10,10,0.97)" : "rgba(255,255,255,0.97)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${border}`, padding: "0 12px", display: "flex", alignItems: "center", gap: 8, height: 50 }}>
        <button onClick={() => { setAppScreen("explore"); setActiveProject(null); setViewingProfile(null); setViewFullProfile(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500, color: text, letterSpacing: "-0.5px", flexShrink: 0 }}>[CoLab]</button>

        {/* Global search — full bar on desktop, expandable on mobile */}
        <div style={{ position: "relative", flexShrink: 0 }} className="search-wrap">
          {/* Desktop: full input */}
          <div className="search-desktop" style={{ width: 180 }}>
            <input
              placeholder="search people, projects, communities..."
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
                  placeholder="search people, projects, communities..."
                  value={globalSearch}
                  onChange={e => setGlobalSearch(e.target.value)}
                  autoFocus
                  style={{ ...inputStyle, fontSize: 13, marginBottom: globalSearch.length > 0 ? 8 : 0 }}
                />
                {globalSearch.length > 0 && (
                  <>
                    {peopleSearchResults.length > 0 && <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", padding: "2px 4px 6px" }}>PEOPLE</div>}
                    {peopleSearchResults.map(u => (
                      <button key={u.id} onClick={() => { setViewFullProfile(u); setGlobalSearch(""); setShowGlobalSearch(false); }} style={{ width: "100%", padding: "10px 12px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 10, alignItems: "center", textAlign: "left", borderTop: `1px solid ${border}` }}
                        onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        <Avatar initials={initials(u.name)} src={u.avatar_url} size={28} dark={dark} />
                        <div>
                          <div style={{ fontSize: 13, color: text }}>{u.name}</div>
                          <div style={{ fontSize: 11, color: textMuted }}>{u.role}</div>
                        </div>
                      </button>
                    ))}
                    {projectSearchResults.length > 0 && <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", padding: "10px 4px 6px" }}>PROJECTS</div>}
                    {projectSearchResults.map(p => (
                      <button key={p.id} onClick={() => { setActiveProject(p); loadProjectData(p.id); setAppScreen("workspace"); setProjectTab("tasks"); setGlobalSearch(""); setShowGlobalSearch(false); }} style={{ width: "100%", padding: "10px 12px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 10, alignItems: "center", textAlign: "left", borderTop: `1px solid ${border}` }}
                        onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        <span style={{ fontSize: 16 }}>◈</span>
                        <div>
                          <div style={{ fontSize: 13, color: text }}>{p.title}</div>
                          <div style={{ fontSize: 11, color: textMuted }}>project · {p.category}</div>
                        </div>
                      </button>
                    ))}
                    {communitySearchResults.length > 0 && <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", padding: "10px 4px 6px" }}>COMMUNITIES</div>}
                    {communitySearchResults.map(c => (
                      <button key={c.id} onClick={() => { setActiveCommunity(c); setAppScreen("communities"); setGlobalSearch(""); setShowGlobalSearch(false); }} style={{ width: "100%", padding: "10px 12px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 10, alignItems: "center", textAlign: "left", borderTop: `1px solid ${border}` }}
                        onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        <span style={{ fontSize: 16 }}>{c.emoji || "◈"}</span>
                        <div>
                          <div style={{ fontSize: 13, color: text }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: textMuted }}>community</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
                {globalSearch.length > 0 &&
                  peopleSearchResults.length === 0 &&
                  projectSearchResults.length === 0 &&
                  communitySearchResults.length === 0 && (
                  <div style={{ fontSize: 12, color: textMuted, padding: "8px 4px" }}>no results.</div>
                )}
              </div>
            )}
          </div>
          {/* Desktop dropdown results */}
          {showGlobalSearch && globalSearch.length > 0 && (
            <div className="search-desktop" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, width: 260, background: bg, border: `1px solid ${border}`, borderRadius: 8, zIndex: 300, overflow: "hidden", boxShadow: dark ? "0 8px 24px rgba(0,0,0,0.6)" : "0 8px 24px rgba(0,0,0,0.1)" }}>
              {peopleSearchResults.length > 0 && <div style={{ padding: "8px 14px 4px", fontSize: 10, color: textMuted, letterSpacing: "1px" }}>PEOPLE</div>}
              {peopleSearchResults.map(u => (
                <button key={u.id} onClick={() => { setViewFullProfile(u); setGlobalSearch(""); setShowGlobalSearch(false); }}
                  style={{ width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 8, alignItems: "center", textAlign: "left" }}
                  onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                  <Avatar initials={initials(u.name)} src={u.avatar_url} size={22} dark={dark} />
                  <div>
                    <div style={{ fontSize: 11, color: text }}>{u.name}</div>
                    <div style={{ fontSize: 10, color: textMuted }}>{u.role}</div>
                  </div>
                </button>
              ))}
              {projectSearchResults.length > 0 && <div style={{ padding: "8px 14px 4px", fontSize: 10, color: textMuted, letterSpacing: "1px", borderTop: `1px solid ${border}` }}>PROJECTS</div>}
              {projectSearchResults.map(p => (
                <button key={p.id} onClick={() => { setActiveProject(p); loadProjectData(p.id); setAppScreen("workspace"); setProjectTab("tasks"); setGlobalSearch(""); setShowGlobalSearch(false); }}
                  style={{ width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 8, alignItems: "center", textAlign: "left" }}
                  onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                  <span style={{ fontSize: 14 }}>◈</span>
                  <div>
                    <div style={{ fontSize: 11, color: text }}>{p.title}</div>
                    <div style={{ fontSize: 10, color: textMuted }}>project · {p.category}</div>
                  </div>
                </button>
              ))}
              {communitySearchResults.length > 0 && <div style={{ padding: "8px 14px 4px", fontSize: 10, color: textMuted, letterSpacing: "1px", borderTop: `1px solid ${border}` }}>COMMUNITIES</div>}
              {communitySearchResults.map(c => (
                <button key={c.id} onClick={() => { setActiveCommunity(c); setAppScreen("communities"); setGlobalSearch(""); setShowGlobalSearch(false); }}
                  style={{ width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 8, alignItems: "center", textAlign: "left" }}
                  onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                  <span style={{ fontSize: 14 }}>{c.emoji || "◈"}</span>
                  <div>
                    <div style={{ fontSize: 11, color: text }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: textMuted }}>community</div>
                  </div>
                </button>
              ))}
              {peopleSearchResults.length === 0 &&
               projectSearchResults.length === 0 &&
               communitySearchResults.length === 0 && (
                <div style={{ padding: "12px 14px", fontSize: 12, color: textMuted }}>no results.</div>
              )}
            </div>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Nav items */}
        <div className="desktop-nav-items" style={{ display: "flex", gap: 0, alignItems: "center" }}>
          {navItems.map(({ id, label, badge }) => (
            <button key={id} onClick={() => { setAppScreen(id); setActiveProject(null); setViewingProfile(null); setViewFullProfile(null); setShowNotifications(false); if (id === "explore") setExploreTab("feed"); }}
              style={{ position: "relative", background: appScreen === id && !activeProject && !showNotifications ? bg3 : "none", color: appScreen === id && !activeProject && !showNotifications ? text : textMuted, border: "none", borderRadius: 6, padding: "5px 5px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0 }}>
              {label}
              {badge > 0 && <span style={{ position: "absolute", top: 2, right: 2, width: 5, height: 5, borderRadius: "50%", background: text, border: `1px solid ${bg}` }} />}
            </button>
          ))}
        </div>
        {/* Bell + settings — always visible (desktop & mobile) */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0, height: "100%" }}>
          <button onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications) setNotifications(prev => prev.map(n => ({ ...n, read: true }))); }}
            style={{ position: "relative", background: showNotifications ? bg3 : "none", border: "none", borderRadius: 6, width: 26, height: 26, cursor: "pointer", color: textMuted, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            {unreadNotifs > 0 && <span style={{ position: "absolute", top: 2, right: 2, width: 6, height: 6, borderRadius: 999, background: text, border: `1.5px solid ${bg}` }} />}
          </button>
          <button onClick={() => setShowSettings(true)}
            style={{ background: "none", border: "none", borderRadius: 6, width: 26, height: 26, cursor: "pointer", color: textMuted, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </nav>
      <div className="mobile-tabbar" style={{ display: "none", position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 220, background: bg, borderTop: `1px solid ${border}`, height: 56, alignItems: "center", justifyContent: "space-around", padding: "0 8px", paddingBottom: "env(safe-area-inset-bottom)" }}>
        {navItems.map(({ id, label, badge }) => (
          <button key={`mobile-${id}`} onClick={() => { setAppScreen(id); setActiveProject(null); setViewingProfile(null); setViewFullProfile(null); setShowNotifications(false); if (id === "explore") setExploreTab("feed"); }}
            style={{ position: "relative", background: "none", color: appScreen === id ? text : textMuted, border: "none", padding: "4px 6px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {label}
            {badge > 0 && <span style={{ position: "absolute", top: 2, right: 0, width: 5, height: 5, borderRadius: "50%", background: text, border: `1px solid ${bg}` }} />}
          </button>
        ))}
      </div>

      {/* NOTIFICATIONS */}
      {showNotifications && (
        <>
          <div onClick={() => setShowNotifications(false)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
          <div className="notif-w" style={{ position: "fixed", top: 58, right: 16, width: 340, background: bg, border: `1px solid ${border}`, borderRadius: 12, zIndex: 200, animation: "slideIn 0.2s ease", boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.6)" : "0 8px 32px rgba(0,0,0,0.1)", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${border}`, fontSize: 11, color: textMuted, letterSpacing: "1px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              NOTIFICATIONS
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {notifications.length > 0 && <button className="hb" onClick={markAllNotificationsRead} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 10 }}>mark all read</button>}
                <button className="hb" onClick={() => { setShowNotifications(false); setAppScreen("notifications"); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 10 }}>view all →</button>
              </div>
            </div>
            {notifications.length === 0 && mentionNotifications.length === 0 ? <div style={{ padding: "24px 16px", fontSize: 12, color: textMuted, textAlign: "center" }}>✓ You're all caught up.</div>
              : <>
                {mentionNotifications.map(n => (
                  <div key={n.id} style={{ padding: "14px 16px", borderBottom: `1px solid ${border}`, display: "flex", justifyContent: "space-between", gap: 8, cursor: n.project_id ? "pointer" : "default" }}
                    onClick={() => {
                      if (!n.project_id) return;
                      const proj = projects.find(p => p.id === n.project_id);
                      if (proj) { setActiveProject(proj); loadProjectData(proj.id); setAppScreen("workspace"); setProjectTab("tasks"); setShowNotifications(false); }
                    }}>
                    <div>
                      <div style={{ fontSize: 12, color: text, marginBottom: 2 }}>{n.from_name} mentioned you</div>
                      <div style={{ fontSize: 11, color: textMuted, fontStyle: "italic" }}>"{n.context}..."</div>
                    </div>
                    <button className="hb" onClick={async (e) => { e.stopPropagation(); await supabase.from("mention_notifications").update({ read: true }).eq("id", n.id); setMentionNotifications(prev => prev.filter(x => x.id !== n.id)); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", flexShrink: 0 }}>✕</button>
                  </div>
                ))}
                {notifications.map(n => (
                <div key={n.id} style={{ padding: "14px 16px", borderBottom: `1px solid ${border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <div style={{ fontSize: 12, color: text }}>{n.text}</div>
                    <button className="hb" onClick={async () => {
                      setNotifications(prev => prev.filter(x => x.id !== n.id));
                      await supabase.from("notifications").update({ read: true }).eq("id", n.id);
                    }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", marginLeft: 8 }}>✕</button>
                  </div>
                  {n.type === "application_status" && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ fontSize: 10, color: applicationStatusStyles[n.status]?.color || textMuted, border: `1px solid ${applicationStatusStyles[n.status]?.color || border}`, borderRadius: 999, padding: "2px 8px" }}>
                        {applicationStatusStyles[n.status]?.label || n.status}
                      </span>
                    </div>
                  )}
                  <div style={{ marginBottom: n.type === "application" ? 10 : 0 }}>
                    {n.projectId && (
                      <button className="hb" onClick={() => {
                        const proj = projects.find(p => p.id === n.projectId);
                        if (proj) { setActiveProject(proj); loadProjectData(proj.id); setAppScreen("workspace"); setProjectTab("tasks"); setShowNotifications(false); }
                      }} style={{ background: "none", border: "none", padding: 0, color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline" }}>
                        {n.sub}
                      </button>
                    )}
                    {!n.projectId && n.userId && (
                      <button className="hb" onClick={() => { const u = users.find(x => x.id === n.userId); if (u) { setViewFullProfile(u); setShowNotifications(false); } }} style={{ background: "none", border: "none", padding: 0, color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline" }}>{n.sub}</button>
                    )}
                    {!n.projectId && !n.userId && n.postId && (
                      <button className="hb" onClick={() => { setAppScreen("network"); setShowNotifications(false); }} style={{ background: "none", border: "none", padding: 0, color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline" }}>{n.sub}</button>
                    )}
                    {!n.projectId && !n.userId && !n.postId && <span style={{ fontSize: 11, color: textMuted }}>{n.sub}</span>}
                    <span style={{ fontSize: 11, color: textMuted }}> · {n.time}</span>
                  </div>
                  {n.type === "invite" && (
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                      <button className="hb" onClick={() => handleInviteResponse(n, "accepted")} style={{ flex: 1, background: text, color: bg, border: "none", borderRadius: 6, padding: "6px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>accept</button>
                      <button className="hb" onClick={() => handleInviteResponse(n, "declined")} style={{ flex: 1, background: "none", color: textMuted, border: `1px solid ${border}`, borderRadius: 6, padding: "6px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>decline</button>
                    </div>
                  )}
                  {n.type === "task_assigned" && (
                    <div style={{ fontSize: 10, color: textMuted, marginBottom: 8 }}>Task assignment</div>
                  )}
                  {n.type === "application" && n.applicant && (
                    <div>
                      <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                          <Avatar initials={n.applicant.initials} src={users.find(u => u.id === n.applicant.id)?.avatar_url} size={28} dark={dark} />
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
                    <Avatar initials={initials(u.name)} src={u.avatar_url} size={36} dark={dark} />
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

      {/* MATCH MODAL */}
      {discoverMatch && (
        <div onClick={() => setDiscoverMatch(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: 32, maxWidth: 320, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 16 }}>+</div>
            <div style={{ fontSize: 16, color: text, letterSpacing: "-0.5px", marginBottom: 8 }}>it's a match.</div>
            <div style={{ fontSize: 12, color: textMuted, marginBottom: 24 }}>you and {discoverMatch.name} both want to collaborate.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="hb" onClick={() => setDiscoverMatch(null)}
                style={{ flex: 1, padding: "10px", background: "none", border: `1px solid ${border}`, borderRadius: 8, fontSize: 12, cursor: "pointer", color: textMuted, fontFamily: "inherit" }}>keep discovering</button>
              <button className="hb" onClick={() => { openDm(discoverMatch); setDiscoverMatch(null); }}
                style={{ flex: 1, padding: "10px", background: text, border: "none", borderRadius: 8, fontSize: 12, cursor: "pointer", color: bg, fontFamily: "inherit" }}>send a message</button>
            </div>
          </div>
        </div>
      )}

      {/* COLLABORATORS LIST */}
      {showCollaboratorsList && (() => {
        const subjectUser = viewFullProfile || profile;
        const collabs = getCollaborators(subjectUser?.id);
        return (
          <div onClick={() => setShowCollaboratorsList(false)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.92)" : "rgba(200,200,200,0.88)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(12px)", padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "24px", width: "100%", maxWidth: 540, maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <button onClick={() => setShowCollaboratorsList(false)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, padding: 0 }}>← back</button>
                <button onClick={() => setShowCollaboratorsList(false)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 16 }}>✕</button>
              </div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 6 }}>COLLABORATORS</div>
              <div style={{ fontSize: 16, color: text, marginBottom: 16 }}>{subjectUser?.name || "Profile"} · {collabs.length} collaborator{collabs.length !== 1 ? "s" : ""}</div>
              {collabs.length === 0 ? (
                <div style={{ fontSize: 12, color: textMuted }}>no collaborators yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {collabs.map((c) => (
                    <div key={c.user.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: `1px solid ${border}`, borderRadius: 10, background: bg2 }}>
                      <Avatar initials={initials(c.user.name)} src={c.user.avatar_url} size={34} dark={dark} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: text }}>{c.user.name}</div>
                        <div style={{ fontSize: 11, color: textMuted }}>{c.user.role || "collaborator"}</div>
                      </div>
                      <button
                        className="hb"
                        onClick={() => { setShowCollaboratorsList(false); setViewFullProfile(c.user); }}
                        style={{ ...btnG, padding: "6px 10px", fontSize: 11, color: text }}
                      >
                        View profile
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* PROJECTS MODAL */}
      {showProjectsFor && (() => {
        const isMe = showProjectsFor === authUser?.id;
        const subjectUser = isMe ? profile : users.find(u => u.id === showProjectsFor);
        const subjectProjects = [...projects.filter(p => p.owner_id === showProjectsFor)].sort((a, b) => Number(b.featured) - Number(a.featured) || new Date(b.created_at) - new Date(a.created_at));
        const collaboratedProjects = applications.filter(a => a.applicant_id === showProjectsFor && a.status === "accepted").map(a => projects.find(p => p.id === a.project_id)).filter(Boolean);
        return (
          <div onClick={() => setShowProjectsFor(null)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.92)" : "rgba(200,200,200,0.88)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(12px)", padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "28px", width: "100%", maxWidth: 480, maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 6 }}>PROJECTS</div>
                  <div style={{ fontSize: 16, color: text, fontWeight: 400 }}>{isMe ? "your" : `${subjectUser?.name?.split(" ")[0]}'s`} projects</div>
                  <div style={{ fontSize: 12, color: textMuted, marginTop: 3 }}>{subjectProjects.length} owned · {collaboratedProjects.length} collaborated</div>
                </div>
                <button onClick={() => setShowProjectsFor(null)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>✕</button>
              </div>
              {subjectProjects.length === 0 && collaboratedProjects.length === 0 ? (
                <div style={{ fontSize: 13, color: textMuted, padding: "20px 0", textAlign: "center" }}>no projects yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {subjectProjects.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 8 }}>OWNED</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {subjectProjects.map((p, i, arr) => (
                          <div key={p.id} onClick={() => { setShowProjectsFor(null); setActiveProject(p); loadProjectData(p.id); setViewFullProfile(null); setAppScreen("workspace"); }} style={{ padding: "14px 16px", background: bg2, borderRadius: i === 0 && arr.length === 1 ? 10 : i === 0 ? "10px 10px 0 0" : i === arr.length - 1 ? "0 0 10px 10px" : 0, border: `1px solid ${border}`, borderBottom: i < arr.length - 1 ? "none" : `1px solid ${border}`, cursor: "pointer", transition: "opacity 0.15s" }}
                            onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                              <div style={{ fontSize: 13, color: text, fontWeight: p.featured ? 500 : 400 }}>{p.title}</div>
                              <span style={{ fontSize: 10, border: `1px solid ${p.shipped ? "#22c55e66" : border}`, borderRadius: 3, padding: "1px 6px", color: p.shipped ? "#22c55e" : textMuted, flexShrink: 0 }}>{p.shipped ? "shipped" : "active"}</span>
                            </div>
                            {p.description && <div style={{ fontSize: 11, color: textMuted }}>{p.description.slice(0, 80)}{p.description.length > 80 ? "..." : ""}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {collaboratedProjects.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 8 }}>COLLABORATED ON</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {collaboratedProjects.map((p, i, arr) => (
                          <div key={p.id} onClick={() => { setShowProjectsFor(null); setActiveProject(p); loadProjectData(p.id); setViewFullProfile(null); setAppScreen("workspace"); }} style={{ padding: "14px 16px", background: bg2, borderRadius: i === 0 && arr.length === 1 ? 10 : i === 0 ? "10px 10px 0 0" : i === arr.length - 1 ? "0 0 10px 10px" : 0, border: `1px solid ${border}`, borderBottom: i < arr.length - 1 ? "none" : `1px solid ${border}`, cursor: "pointer", transition: "opacity 0.15s" }}
                            onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                              <div style={{ fontSize: 13, color: text }}>{p.title}</div>
                              <span style={{ fontSize: 10, border: `1px solid ${p.shipped ? "#22c55e66" : border}`, borderRadius: 3, padding: "1px 6px", color: p.shipped ? "#22c55e" : textMuted, flexShrink: 0 }}>{p.shipped ? "shipped" : "active"}</span>
                            </div>
                            {p.description && <div style={{ fontSize: 11, color: textMuted }}>{p.description.slice(0, 80)}{p.description.length > 80 ? "..." : ""}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {isMe && (
                <button className="hb" onClick={() => { setShowProjectsFor(null); setShowCreate(true); }} style={{ marginTop: 20, width: "100%", padding: "12px", background: "none", border: `1px solid ${border}`, borderRadius: 8, color: text, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>+ create new project</button>
              )}
            </div>
          </div>
        );
      })()}

      {/* FOLLOWERS / FOLLOWING MODAL */}
      {showFollowList && (() => {
        const isFollowers = showFollowList === "followers";
        const listIds = isFollowers ? followers : following;
        const listUsers = listIds.map(id => users.find(u => u.id === id)).filter(Boolean);
        return (
          <div onClick={() => setShowFollowList(null)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.92)" : "rgba(200,200,200,0.88)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(12px)", padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "28px", width: "100%", maxWidth: 480, maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 6 }}>{isFollowers ? "FOLLOWERS" : "FOLLOWING"}</div>
                  <div style={{ fontSize: 16, color: text, fontWeight: 400 }}>{isFollowers ? `${followers.length} follower${followers.length !== 1 ? "s" : ""}` : `${following.length} following`}</div>
                </div>
                <button onClick={() => setShowFollowList(null)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>✕</button>
              </div>
              {listUsers.length === 0 ? (
                <div style={{ fontSize: 13, color: textMuted, padding: "20px 0", textAlign: "center" }}>{isFollowers ? "no followers yet." : "not following anyone yet."}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {listUsers.map((u, i) => (
                    <div key={u.id} onClick={() => { setShowFollowList(null); setViewFullProfile(u); }} style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 16px", background: bg2, borderRadius: i === 0 && listUsers.length === 1 ? 10 : i === 0 ? "10px 10px 0 0" : i === listUsers.length - 1 ? "0 0 10px 10px" : 0, border: `1px solid ${border}`, borderBottom: i < listUsers.length - 1 ? "none" : `1px solid ${border}`, cursor: "pointer", transition: "opacity 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                      <Avatar initials={initials(u.name)} src={u.avatar_url} size={40} dark={dark} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: text, marginBottom: 2 }}>{u.name}</div>
                        {u.username && <div style={{ fontSize: 11, color: textMuted }}>@{u.username}</div>}
                        {u.role && <div style={{ fontSize: 11, color: textMuted }}>{u.role}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* EXPLORE */}
      {!viewFullProfile && appScreen === "explore" && !activeProject && (
        <div className="pad fu" style={{ width: "100%", padding: "28px 32px 48px" }}>
          {showFirstTimeGuide && renderFirstTimeGuide()}

          {/* Top-level explore tabs: feed | projects */}
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 16 }}>{exploreTab === "projects" ? "OPEN PROJECTS" : "BUILDER FEED"}</div>
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 28 }}>
            {[["feed", "feed"], ["projects", "projects"]].map(([id, label]) => (
              <button key={id} onClick={() => setExploreTab(id)} style={{
                background: "none", border: "none",
                borderBottom: `1px solid ${border}`,
                color: exploreTab === id ? text : textMuted,
                padding: "10px 0", textAlign: "left",
                fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                transition: "color 0.15s", whiteSpace: "nowrap",
                fontWeight: exploreTab === id ? 500 : 400,
              }}>
                {label}
              </button>
            ))}
          </div>

          {/* PROJECTS TAB */}
          {exploreTab === "projects" && (
            <div className="projects-layout" style={{ maxWidth: 1020, margin: "0 auto", display: "flex", gap: 48, alignItems: "flex-start" }}>

              {/* Left: main project list */}
              <div style={{ flex: 1, minWidth: 0 }}>

                {/* Sub-tabs */}
                <div style={{ display: "flex", borderBottom: `1px solid ${border}`, marginBottom: 24 }}>
                  {["for-you","all"].map(id => (
                    <button key={id} onClick={() => setProjectsSubTab(id)} style={{ background: "none", border: "none", borderBottom: projectsSubTab === id ? `1px solid ${text}` : "1px solid transparent", color: projectsSubTab === id ? text : textMuted, padding: "8px 16px 8px 0", fontSize: 11, cursor: "pointer", fontFamily: "inherit", marginRight: 8, transition: "all 0.15s", display: "inline-flex", gap: 6, alignItems: "center" }}>
                      {id === "for-you" ? "for you" : "all"}
                      {id === "for-you" && forYou.length > 0 && <span style={{ fontSize: 9, background: bg3, borderRadius: 10, padding: "1px 5px", color: textMuted }}>{forYou.length}</span>}
                    </button>
                  ))}
                </div>

                {/* Filters — all sub-tab only */}
                {projectsSubTab === "all" && (
                  <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                    <input placeholder="search projects..." value={search} onChange={e => setSearch(e.target.value)} style={inputStyle} />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <select value={industryFilter || ""} onChange={e => setIndustryFilter(e.target.value || null)} style={{ ...inputStyle, maxWidth: 220, fontSize: 11, padding: "7px 10px" }}>
                        <option value="">all industries</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input placeholder="filter by location" value={locationFilter} onChange={e => setLocationFilter(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 150, fontSize: 11, padding: "7px 10px" }} />
                    </div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {["Design","Engineering","Marketing","Music","Video","Finance","AI/ML","Writing","Product"].map(s => { const sel = filterSkill === s; return <button key={s} className="hb" onClick={() => setFilterSkill(sel ? null : s)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                      {(filterSkill || industryFilter || locationFilter || search || regionFilter) && <button className="hb" onClick={clearExploreFilters} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: "none", color: textMuted, border: `1px solid ${border}` }}>clear</button>}
                    </div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: textMuted, letterSpacing: "1px" }}>REGION</span>
                      {["local","city","national","international"].map(r => { const sel = regionFilter === r; return <button key={r} className="hb" onClick={() => setRegionFilter(sel ? null : r)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{r}</button>; })}
                    </div>
                    {exploreFiltersClearedNotice && <div style={{ fontSize: 11, color: textMuted }}>Showing trending — filters cleared</div>}
                  </div>
                )}

                {/* Project list */}
                {loading ? <Spinner dark={dark} /> : (
                  <>
                    {projectsSubTab === "for-you" && ((profile?.skills || []).length === 0
                      ? <div style={{ padding: "36px 0", color: textMuted, fontSize: 13 }}>Add skills to your profile to see matched projects. <button onClick={() => setAppScreen("profile")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>update profile →</button></div>
                      : forYou.length === 0
                        ? <div style={{ padding: "36px 0", color: textMuted, fontSize: 13 }}>No matches yet. <button className="hb" onClick={() => setProjectsSubTab("all")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>browse all →</button></div>
                        : <div><div style={{ padding: "14px 0 2px", fontSize: 11, color: textMuted }}>{forYou.length} project{forYou.length !== 1 ? "s" : ""} matching your skills</div>{forYou.map(p => <PRow key={p.id} p={p} />)}</div>
                    )}
                    {projectsSubTab === "all" && (
                      allP.length === 0
                        ? <div style={{ padding: "24px 0" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
                              <div style={{ fontSize: 11, color: textMuted, letterSpacing: "1px" }}>Trending right now</div>
                              <button className="hb" onClick={clearExploreFilters} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline", padding: 0 }}>clear filters</button>
                            </div>
                            {trendingFallbackProjects.length > 0 ? trendingFallbackProjects.map(p => <PRow key={p.id} p={p} />) : <div style={{ fontSize: 12, color: textMuted }}>No projects found. <button onClick={openCreateProjectFlow} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline", padding: 0 }}>create one →</button></div>}
                          </div>
                        : allP.map(p => <PRow key={p.id} p={p} />)
                    )}
                  </>
                )}
              </div>{/* end left column */}

              {/* Right: sidebar */}
                <div className="projects-right-sidebar" style={{ width: 260, flexShrink: 0, position: "sticky", top: 24, display: "flex", flexDirection: "column", gap: 28 }}>

                {/* CTA */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button className="hb" onClick={openCreateProjectFlow} style={{ ...btnP, width: "100%", textAlign: "center" }}>+ post a project</button>
                </div>

                {/* Stats */}
                <div style={{ border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden" }}>
                  {[["open now", projects.filter(p => (p.collaborators||0) < (p.max_collaborators||2)).length], ["total projects", projects.length], ["builders", users.length]].map(([l, v], i, arr) => (
                    <div key={l} style={{ padding: "12px 16px", background: bg2, borderBottom: i < arr.length - 1 ? `1px solid ${border}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 11, color: textMuted }}>{l}</div>
                      <div style={{ fontSize: 18, color: text, letterSpacing: "-0.5px" }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Trending */}
                {trendingProjects.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 12 }}>TRENDING</div>
                    <div style={{ border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden" }}>
                      {trendingProjects.map((p, i, arr) => (
                        <div key={p.id} onClick={() => { setActiveProject(p); loadProjectData(p.id); }} style={{ padding: "10px 14px", background: bg2, borderBottom: i < arr.length - 1 ? `1px solid ${border}` : "none", cursor: "pointer", transition: "opacity 0.15s" }}
                          onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                          <div style={{ fontSize: 10, color: textMuted }}>{p.category} · {applications.filter(a => a.project_id === p.id).length} applicants</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Collaborators */}
                {(() => {
                  const topCollabs = users
                    .filter(u => u.id !== authUser?.id && userRatings[u.id]?.count > 0)
                    .map(u => ({
                      ...u,
                      avgRating: userRatings[u.id].sum / userRatings[u.id].count,
                      reviewCount: userRatings[u.id].count,
                      shipped: shippedCollabCount[u.id] || 0,
                      score: (userRatings[u.id].sum / userRatings[u.id].count) * 0.6 + (shippedCollabCount[u.id] || 0) * 0.4,
                    }))
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 5);
                  if (topCollabs.length === 0) return null;
                  return (
                    <div>
                      <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 12 }}>TOP COLLABORATORS</div>
                      <div style={{ border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden" }}>
                        {topCollabs.map((u, i, arr) => (
                          <div key={u.id} onClick={() => setViewingProfile(u)} style={{ padding: "10px 14px", background: bg2, borderBottom: i < arr.length - 1 ? `1px solid ${border}` : "none", cursor: "pointer", display: "flex", gap: 10, alignItems: "center", transition: "opacity 0.15s" }}
                            onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                              <div style={{ fontSize: 10, color: textMuted }}>{u.shipped} shipped · {u.reviewCount} review{u.reviewCount !== 1 ? "s" : ""}</div>
                            </div>
                            <div style={{ flexShrink: 0, display: "flex", gap: 1, alignItems: "center" }}>
                              {[1,2,3,4,5].map(n => (
                                <span key={n} style={{ fontSize: 11, color: n <= Math.round(u.avgRating) ? text : textMuted, opacity: n <= Math.round(u.avgRating) ? 1 : 0.3 }}>+</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

              </div>{/* end sidebar */}
            </div>
          )}

          {/* FEED TAB */}
          {exploreTab === "feed" && (() => {
            const firstName = profile?.name?.split(" ")[0] || "you";
            const navigateToProject = (projectId) => {
              if (!projectId) return;
              const proj = projects.find(p => p.id === projectId);
              if (!proj) return;
              setActiveProject(proj);
              loadProjectData(proj.id);
              // Owner or accepted collaborator → workspace; everyone else → explore projects tab
              const isCollaborator = applications.some(a => a.project_id === projectId && a.applicant_id === authUser?.id && normalizeApplicationStatus(a.status) === "accepted");
              if (proj.owner_id === authUser?.id || isCollaborator) {
                setAppScreen("workspace");
                setProjectTab("tasks");
              } else {
                setAppScreen("explore");
                setExploreTab("projects");
              }
            };
            const postCtx = {
              postLikes, postReposts, expandedComments, postComments, authUser, users,
              handleDeletePost, dark, border, text, textMuted, bg, bg2, btnP, inputStyle,
              setViewingProfile, handleLike, handleRepost, setExpandedComments, loadComments,
              myInitials, setPostComments, profile, supabase,
              pendingLikeIds, commentPulseIds, pendingCommentByPost,
              recentActivityByPost, justInsertedPostIds, markCommentPending, markRecentActivity,
              navigateToProject, postMenuOpenId, setPostMenuOpenId, openReportModal,
              editingFeedPostId, setEditingFeedPostId, editingFeedPostContent, setEditingFeedPostContent,
              handleSaveFeedPostEdit, showToast,
            };
            // ── Feed data prep ─────────────────────────────────────────────
            const mySkillSet = new Set(profile?.skills || []);

            const getSkillOverlap = (item) => {
              const authorId = item.user_id || item.project?.owner_id;
              if (authorId === authUser?.id) return [];
              const author = users.find(u => u.id === authorId);
              return (author?.skills || []).filter(s => mySkillSet.has(s));
            };

            const scoreItem = (item) => {
              const authorId = item.user_id || item.project?.owner_id;
              const overlap = getSkillOverlap(item).length;
              const isFollowed = following.includes(authorId);
              const ageHours = (Date.now() - new Date(item.created_at)) / 3600000;
              const freshness = Math.exp(-ageHours / 96); // ~4-day half-life
              const likeBoost = item._type === "post" ? Math.min((item.like_count || 0) * 0.15, 3) : 0;
              const communityBoost = item._type === "community_post" ? Math.min((item.upvotes || 0) * 0.3 + (item.comment_count || 0) * 0.2, 4) : 0;
              return overlap * 2.5 + (isFollowed ? 3 : 0) + freshness * 5 + likeBoost + communityBoost;
            };

            const diversifyFeed = (items) => {
              const result = [], deferred = [];
              for (const item of items) {
                const aid = item.user_id || item.project?.owner_id;
                const l1 = result[result.length - 1], l2 = result[result.length - 2];
                const lid1 = l1?.user_id || l1?.project?.owner_id;
                const lid2 = l2?.user_id || l2?.project?.owner_id;
                (aid === lid1 && aid === lid2) ? deferred.push(item) : result.push(item);
              }
              return [...result, ...deferred];
            };

            const getReasonLabel = (item) => {
              if (item._type === "project_created") {
                const proj = item.project;
                const matchSkills = (proj.skills || []).filter(s => mySkillSet.has(s));
                if (matchSkills.length > 0) return `looking for ${matchSkills.slice(0, 2).join(", ")}`;
                if (following.includes(proj.owner_id)) return "you follow them";
                return null;
              }
              const overlap = getSkillOverlap(item);
              if (overlap.length >= 3) return `${overlap.length} skills in common`;
              if (overlap.length > 0) return overlap.slice(0, 2).join(" · ");
              if (following.includes(item.user_id)) return "you follow them";
              return null;
            };

            const hideItem = (id) => setHiddenFeedIds(prev => { const n = new Set(prev); n.add(id); return n; });

            const acceptedProjectIds = new Set(
              applications
                .filter(a => a.applicant_id === authUser?.id && normalizeApplicationStatus(a.status) === "accepted")
                .map(a => a.project_id)
            );
            const followedProjectEvents = projects
              .filter(p => following.includes(p.owner_id) && !p.archived && !p.is_private && !acceptedProjectIds.has(p.id))
              .map(p => ({ _type: "project_created", id: `proj-${p.id}`, created_at: p.created_at, project: p }));

            const filteredPosts = posts.filter(post => {
              const author = users.find(u => u.id === post.user_id);
              return matchesRegion(author?.location, regionFilter, profile?.location, author?.location_geohash, profile?.location_geohash);
            });
            // Hot community posts from joined communities surfaced in feed
            const hotCommunityFeedItems = topCommunityPosts.map(cp => ({
              ...cp,
              _type: "community_post",
              id: `cp-${cp.id}`,
              _communityName: cp.communities?.name || "",
              _communityEmoji: COMMUNITY_SYMBOLS[cp.communities?.slug] || cp.communities?.emoji || "◈",
              _communityId: cp.community_id,
              _originalId: cp.id,
            }));
            const baseList = [...filteredPosts.map(p => ({ ...p, _type: "post" })), ...followedProjectEvents, ...hotCommunityFeedItems];
            const followFilteredList = followingOnly
              ? baseList.filter(item => {
                  const aid = item.user_id || item.project?.owner_id;
                  return following.includes(aid);
                })
              : baseList;
            const forYouFeed = diversifyFeed([...followFilteredList].sort((a, b) => scoreItem(b) - scoreItem(a)));
            const followingFeed = [...baseList]
              .filter(item => following.includes(item.user_id || item.project?.owner_id))
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            const mergedFeed = feedSort === "following" ? followingFeed : forYouFeed;
            const visibleFeed = mergedFeed.filter(item => !hiddenFeedIds.has(item.id));
            const FEED_PAGE_SIZE = 20;
            const pagedFeed = visibleFeed.slice(0, feedPage * FEED_PAGE_SIZE);
            const hasMoreFeed = pagedFeed.length < visibleFeed.length;
            const joinedAt = profile?.created_at || authUser?.created_at;
            const joinedWithin48Hours = joinedAt ? (Date.now() - new Date(joinedAt).getTime()) < 48 * 3600000 : false;
            const showFirstProjectFlow = appScreen === "explore"
              && exploreTab === "feed"
              && visibleFeed.length === 0
              && joinedWithin48Hours
              && !dismissFirstProjectFlow;

            // Trending: top 3 liked posts in last 7 days with skill overlap
            const trendingPosts = posts
              .filter(p => {
                const ageMs = Date.now() - new Date(p.created_at);
                const poster = users.find(u => u.id === p.user_id);
                return ageMs < 7 * 24 * 3600000
                  && p.user_id !== authUser?.id
                  && !hiddenFeedIds.has(p.id)
                  && (mySkillSet.size === 0 || (poster?.skills || []).some(s => mySkillSet.has(s)));
              })
              .sort((a, b) => (b.like_count || 0) - (a.like_count || 0))
              .slice(0, 3);

            // ── Sidebar data ─────────────────────────────────────────────
            const suggestedPeople = users
              .filter(u => u.id !== authUser?.id && !following.includes(u.id))
              .map(u => ({ ...u, overlap: (u.skills || []).filter(s => mySkillSet.has(s)).length }))
              .sort((a, b) => b.overlap - a.overlap)
              .slice(0, 5);

            const sidebarProjects = browseBase
              .map(p => ({ ...p, overlap: (p.skills || []).filter(s => mySkillSet.has(s)).length }))
              .sort((a, b) => b.overlap - a.overlap || new Date(b.created_at) - new Date(a.created_at))
              .slice(0, 4);

            return (
              <div className="feed-layout" style={{ maxWidth: 1020, margin: "0 auto", display: "flex", gap: 48, alignItems: "flex-start" }}>
                <style>{`
                  @keyframes feedPulse { 0% { transform: scale(1); } 45% { transform: scale(1.08); } 100% { transform: scale(1); } }
                  @keyframes feedPostAppear { 0% { opacity: 0; transform: translateY(-8px); } 100% { opacity: 1; transform: translateY(0); } }
                `}</style>

                {/* Left: main feed column */}
                <div style={{ flex: 1, minWidth: 0 }}>

{shouldShowOnboardingChecklist && (
                  <div style={{ marginBottom: 20, border: `1px solid ${border}`, background: bg2, borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontSize: 12, color: text }}>Get started</div>
                      <button className="hb" onClick={() => { localStorage.setItem("colab_onboarding_dismissed", "true"); setDismissOnboardingChecklist(true); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>×</button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {onboardingChecklist.map((item) => (
                        <button key={item.id} onClick={item.onClick} style={{ background: "none", border: "none", padding: 0, textAlign: "left", color: item.done ? textMuted : text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>
                          [{item.done ? "x" : " "}] {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sort + following filter */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${border}`, marginBottom: 24 }}>
                  <div style={{ display: "flex" }}>
                    {[["for-you", "for you"], ["following", "following"]].map(([val, label]) => (
                      <button key={val} className="hb" onClick={() => { setFeedSort(val); setFeedPage(1); }}
                        style={{ background: "none", border: "none", borderBottom: feedSort === val ? `1px solid ${text}` : "1px solid transparent", color: feedSort === val ? text : textMuted, padding: "8px 16px 8px 0", fontSize: 11, cursor: "pointer", fontFamily: "inherit", marginRight: 8, transition: "all 0.15s" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Region filter */}
                <div style={{ marginBottom: 16, display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginRight: 4 }}>REGION</span>
                  {["local","city","national","international"].map(r => { const sel = regionFilter === r; return <button key={r} className="hb" onClick={() => setRegionFilter(sel ? null : r)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{r}</button>; })}
                </div>

                {/* New posts banner */}
                {pendingFeedPosts.length > 0 && (
                  <button className="hb" onClick={revealPendingPosts} style={{ marginBottom: 20, background: bg2, border: `1px solid ${border}`, borderRadius: 999, padding: "8px 14px", color: text, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                    {pendingFeedPosts.length} new {pendingFeedPosts.length === 1 ? "post" : "posts"} · show updates
                  </button>
                )}

                {/* Compose box */}
                {showFirstProjectFlow && (
                  <div style={{ border: `1px solid ${border}`, borderRadius: 10, padding: 20, marginBottom: 20 }}>
                    <div style={{ fontSize: 16, color: text, marginBottom: 8 }}>Welcome to CoLab, {firstName}.</div>
                    <div style={{ fontSize: 13, color: textMuted, marginBottom: 12 }}>Here's how to get the most out of it:</div>
                    <div style={{ fontSize: 13, color: textMuted, lineHeight: 1.8, marginBottom: 14 }}>
                      <div>→ Browse open projects</div>
                      <div>→ Post what you're building</div>
                      <div>→ Join a community</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="hb" onClick={() => { localStorage.setItem("colab_first_flow_done", "1"); setDismissFirstProjectFlow(true); setAppScreen("explore"); setExploreTab("projects"); }} style={btnP}>Browse projects →</button>
                      <button className="hb" onClick={() => { localStorage.setItem("colab_first_flow_done", "1"); setDismissFirstProjectFlow(true); }} style={btnG}>Skip</button>
                    </div>
                  </div>
                )}
                <div ref={composerWrapRef} style={{ marginBottom: 28 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <Avatar initials={myInitials} src={profile?.avatar_url} size={32} dark={dark} style={{ marginTop: 4, flexShrink: 0 }} />
                    <div
                      style={{ flex: 1, borderBottom: `1px solid ${composerFocused || newPostContent ? text : border}`, paddingBottom: composerFocused || newPostContent ? 12 : 8, transition: "border-color 0.2s" }}
                    >
                      <MentionInput
                        inputRef={feedComposerRef}
                        multiline
                        users={users}
                        following={following}
                        followers={followers}
                        dark={dark}
                        placeholder={COMPOSER_PLACEHOLDERS[composerPlaceholderIdx]}
                        value={newPostContent}
                        onChange={setNewPostContent}
                        onFocus={() => setComposerFocused(true)}
                        onBlur={undefined}
                        style={{ background: "none", border: "none", outline: "none", resize: "none", fontSize: 14, padding: "2px 0", color: text, lineHeight: 1.65, width: "100%", fontFamily: "inherit", height: composerFocused || newPostContent ? "72px" : "26px", transition: "height 0.2s ease", overflow: "hidden" }}
                      />
                      {(composerFocused || newPostContent.trim() || autoOpenComposer) && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                          {/* Media preview */}
                          {newPostMediaUrl && (
                            <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
                              {newPostMediaType === "audio"
                                ? <div style={{ fontSize: 11, color: text, padding: "8px 12px", background: bg3, borderRadius: 8, display: "flex", gap: 6, alignItems: "center" }}>audio: {newPostMediaUrl.split("/").pop().split("?")[0]}</div>
                                : newPostMediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                                  ? <img src={newPostMediaUrl} alt="" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, border: `1px solid ${border}` }} />
                                  : <div style={{ fontSize: 11, color: textMuted, padding: "6px 10px", background: bg3, borderRadius: 6 }}>file: {newPostMediaUrl.split("/").pop()}</div>}
                              <button onClick={() => { setNewPostMediaUrl(""); setNewPostMediaType(""); }} style={{ position: "absolute", top: 4, right: 4, background: bg, border: `1px solid ${border}`, borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", color: text, fontFamily: "inherit" }}>✕</button>
                            </div>
                          )}
                          {/* Single action bar */}
                          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                            {/* Photo/video */}
                            <label title="photo / video" style={{ cursor: "pointer", display: "flex", flexShrink: 0 }}>
                              <div className="hb" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, color: textMuted }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                              </div>
                              <input type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={async (e) => {
                                const file = e.target.files[0]; if (!file) return;
                                showToast("Uploading...");
                                const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
                                const path = `posts/${authUser.id}/${Date.now()}-${safeName}`;
                                const { error } = await supabase.storage.from("user-uploads").upload(path, file);
                                if (error) { showToast(`Upload failed: ${error.message}`); return; }
                                const { data: { publicUrl } } = supabase.storage.from("user-uploads").getPublicUrl(path);
                                setNewPostMediaUrl(publicUrl); setNewPostMediaType(file.type.startsWith("video") ? "video" : "image");
                                showToast("Ready.");
                              }} />
                            </label>
                            {/* Audio */}
                            <label title="audio" style={{ cursor: "pointer", display: "flex", flexShrink: 0 }}>
                              <div className="hb" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, color: textMuted }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                              </div>
                              <input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac" style={{ display: "none" }} onChange={async (e) => {
                                const file = e.target.files[0]; if (!file) return;
                                showToast("Uploading audio...");
                                const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
                                const path = `posts/${authUser.id}/${Date.now()}-${safeName}`;
                                const { error } = await supabase.storage.from("user-uploads").upload(path, file);
                                if (error) { showToast(`Upload failed: ${error.message}`); return; }
                                const { data: { publicUrl } } = supabase.storage.from("user-uploads").getPublicUrl(path);
                                setNewPostMediaUrl(publicUrl); setNewPostMediaType("audio");
                                showToast("Audio ready.");
                              }} />
                            </label>
                            {/* Divider */}
                            <div style={{ width: 1, height: 14, background: border, margin: "0 6px", flexShrink: 0 }} />
                            {/* Project tag — borderless select */}
                            <select value={newPostProject} onChange={e => setNewPostProject(e.target.value)}
                              style={{ background: "none", border: "none", outline: "none", fontSize: 11, color: newPostProject ? text : textMuted, cursor: "pointer", fontFamily: "inherit", maxWidth: 160, padding: 0, flexShrink: 1, minWidth: 0 }}>
                              <option value="">+ tag project</option>
                              {myProjects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                            </select>
                            <div style={{ flex: 1 }} />
                            <button className="hb" onClick={handleCreatePost} style={{ ...btnP, padding: "6px 16px", fontSize: 12, flexShrink: 0 }}>post</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Trending this week */}
                {trendingPosts.length > 0 && feedSort === "for-you" && (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 12 }}>TRENDING IN YOUR SKILLS</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 0, border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden" }}>
                      {trendingPosts.map((p, i) => {
                        const poster = users.find(u => u.id === p.user_id);
                        const overlap = (poster?.skills || []).filter(s => mySkillSet.has(s));
                        return (
                          <div key={p.id} style={{ padding: "12px 16px", borderBottom: i < trendingPosts.length - 1 ? `1px solid ${border}` : "none", display: "flex", gap: 12, alignItems: "flex-start", background: bg2 }}>
                            <button onClick={() => poster && setViewingProfile(poster)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                              <Avatar initials={p.user_initials} size={32} dark={dark} />
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                <button onClick={() => poster && setViewingProfile(poster)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, fontWeight: 500, color: text, fontFamily: "inherit" }}>{p.user_name}</button>
                                <span style={{ fontSize: 10, color: textMuted }}>♥ {p.like_count || 0}</span>
                              </div>
                              <div style={{ fontSize: 12, color: text, lineHeight: 1.6, marginBottom: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.content}</div>
                              {overlap.length > 0 && <span style={{ fontSize: 9, color: textMuted, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 7px" }}>{overlap.slice(0, 2).join(" · ")}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Feed */}
                {visibleFeed.length === 0
                  ? (
                    <div style={{ padding: "40px 0", textAlign: "center" }}>
                      <div style={{ fontSize: 20, color: text, letterSpacing: "-0.5px", marginBottom: 8 }}>Nothing here yet.</div>
                      <div style={{ fontSize: 13, color: textMuted, marginBottom: 14 }}>Follow people or join communities to fill your feed.</div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                        <button className="hb" onClick={() => { setAppScreen("network"); setNetworkTab("discover"); }} style={btnG}>go to discover</button>
                        <button className="hb" onClick={() => setAppScreen("communities")} style={btnP}>open communities</button>
                      </div>
                    </div>
                  )
                  : pagedFeed.map(item => {
                    const reason = getReasonLabel(item);
                    const isOwn = (item.user_id || item.project?.owner_id) === authUser?.id;

                    const categoryAccent = {
                      "Tech / Software": "#3b82f6",
                      "Creative / Art": "#8b5cf6",
                      "Music": "#ec4899",
                      "Film / Video": "#f97316",
                      "Physical / Hardware": "#10b981",
                      "Business / Startup": "#f59e0b",
                      "Social Impact": "#06b6d4",
                      "Research": "#6366f1",
                      "Other": "#6b7280",
                    };

                    if (item._type === "project_created") {
                      const { project: proj } = item;
                      const owner = users.find(u => u.id === proj.owner_id);
                      const matchSkills = (proj.skills || []).filter(s => mySkillSet.has(s));
                      const accentColor = categoryAccent[proj.category] || "#6b7280";
                      return (
                        <div key={item.id} style={{ padding: "18px 0 18px 12px", borderBottom: `1px solid ${border}`, borderLeft: `3px solid ${accentColor}`, position: "relative", marginLeft: -12 }}>
                          {/* Reason label */}
                          {reason && <div style={{ fontSize: 9, color: textMuted, letterSpacing: "0.5px", marginBottom: 8, textTransform: "uppercase" }}>{reason}</div>}
                          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                            <button onClick={() => owner && setViewingProfile(owner)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                              <Avatar initials={initials(proj.owner_name)} size={36} dark={dark} />
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: textMuted, marginBottom: 4 }}>
                                <button className="hb" onClick={() => owner && setViewingProfile(owner)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 500, padding: 0 }}>{proj.owner_name}</button>
                                {" launched a project"}
                              </div>
                              <button className="hb" onClick={() => { setActiveProject(proj); loadProjectData(proj.id); setExploreTab("projects"); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", fontFamily: "inherit" }}>
                                <div style={{ fontSize: 15, fontWeight: 500, color: text, letterSpacing: "-0.3px", marginBottom: 4 }}>{proj.title}</div>
                              </button>
                              {proj.description && <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.65, marginBottom: 8, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{proj.description}</div>}
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
                                {(proj.skills || []).slice(0, 5).map(s => {
                                  const isMatch = mySkillSet.has(s);
                                  return <span key={s} style={{ fontSize: 10, color: isMatch ? text : textMuted, border: `1px solid ${isMatch ? text : border}`, borderRadius: 3, padding: "1px 8px", fontWeight: isMatch ? 500 : 400, background: isMatch ? (dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)") : "none" }}>{s}{isMatch ? " ✓" : ""}</span>;
                                })}
                              </div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <button className="hb" onClick={() => { setActiveProject(proj); loadProjectData(proj.id); setExploreTab("projects"); }} style={{ ...btnP, fontSize: 11, padding: "5px 14px" }}>
                                  {matchSkills.length > 0 ? "apply to collaborate →" : "view project →"}
                                </button>
                                <span style={{ fontSize: 10, color: textMuted }}>{proj.category}{proj.location ? ` · ${proj.location}` : ""}</span>
                              </div>
                            </div>
                            {/* Hide button */}
                            {!isOwn && (
                              <button className="hb" onClick={() => hideItem(item.id)} title="Not interested" style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 11, fontFamily: "inherit", opacity: 0.5, flexShrink: 0, padding: "2px 4px" }}>✕</button>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // Community post surfaced in feed
                    if (item._type === "community_post") {
                      return (
                        <div key={item.id} style={{ padding: "18px 0", borderBottom: `1px solid ${border}` }}>
                          <div style={{ fontSize: 9, color: textMuted, letterSpacing: "1.5px", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 11, lineHeight: 1 }}>{item._communityEmoji}</span>
                            <span>TRENDING IN {item._communityName.toUpperCase()}</span>
                          </div>
                          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0, width: 36 }}>
                              <button className="hb" onClick={async e => {
                                e.stopPropagation();
                                const pid = item._originalId;
                                const cur = topCommunityPosts.find(p => p.id === pid);
                                const votes = cur?.upvotes ?? item.upvotes;
                                if (communityVotes[pid]) {
                                  await supabase.from("community_post_votes").delete().eq("post_id", pid).eq("user_id", authUser.id);
                                  await supabase.from("community_posts").update({ upvotes: Math.max(0, votes - 1) }).eq("id", pid);
                                  setCommunityVotes(prev => { const n = { ...prev }; delete n[pid]; return n; });
                                } else {
                                  if (communityDownvotes[pid]) { setCommunityDownvotes(prev => { const n = { ...prev }; delete n[pid]; return n; }); }
                                  await supabase.from("community_post_votes").insert({ post_id: pid, user_id: authUser.id });
                                  await supabase.from("community_posts").update({ upvotes: votes + 1 }).eq("id", pid);
                                  setCommunityVotes(prev => ({ ...prev, [pid]: true }));
                                }
                              }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: communityVotes[item._originalId] ? text : textMuted, padding: "2px", lineHeight: 1, fontFamily: "inherit" }}>+</button>
                              <span style={{ fontSize: 12, fontWeight: 500, color: text }}>{item.upvotes}</span>
                              <button className="hb" onClick={async e => {
                                e.stopPropagation();
                                const pid = item._originalId;
                                const cur = topCommunityPosts.find(p => p.id === pid);
                                const votes = cur?.upvotes ?? item.upvotes;
                                if (communityDownvotes[pid]) {
                                  await supabase.from("community_posts").update({ upvotes: votes + 1 }).eq("id", pid);
                                  setCommunityDownvotes(prev => { const n = { ...prev }; delete n[pid]; return n; });
                                } else {
                                  if (communityVotes[pid]) {
                                    await supabase.from("community_post_votes").delete().eq("post_id", pid).eq("user_id", authUser.id);
                                    setCommunityVotes(prev => { const n = { ...prev }; delete n[pid]; return n; });
                                  }
                                  await supabase.from("community_posts").update({ upvotes: votes - 1 }).eq("id", pid);
                                  setCommunityDownvotes(prev => ({ ...prev, [pid]: true }));
                                }
                              }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: communityDownvotes[item._originalId] ? text : textMuted, padding: "2px", lineHeight: 1, fontFamily: "inherit" }}>−</button>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <button className="hb" onClick={async () => {
                                setAppScreen("communities");
                                const comm = communities.find(c => c.id === item._communityId);
                                if (comm) {
                                  setActiveCommunity(comm);
                                  setCommunityPostsLoading(true);
                                  const { posts: cPosts } = await fetchCommunityPosts(comm.id);
                                  setCommunityPosts(cPosts);
                                  setCommunityPostsLoading(false);
                                  const fullPost = cPosts.find(p => p.id === item._originalId);
                                  if (fullPost) { setActiveThread(fullPost); setNewCommentText(""); const comments = await fetchThreadComments(fullPost.id); setThreadComments(prev => ({ ...prev, [fullPost.id]: comments })); }
                                }
                              }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", fontFamily: "inherit" }}>
                                <div style={{ fontSize: 14, color: text, fontWeight: 400, letterSpacing: "-0.2px", marginBottom: 6, lineHeight: 1.4 }}>{item.title}</div>
                              </button>
                              <div style={{ fontSize: 10, color: textMuted }}>{item.user_name} · {relativeTime(item.created_at)} · ... {item.comment_count}</div>
                            </div>
                            {!isOwn && (
                              <button className="hb" onClick={() => hideItem(item.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 11, fontFamily: "inherit", opacity: 0.5, flexShrink: 0 }}>✕</button>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // Regular post — wrap with reason chip + hide
                    return (
                      <div key={item.id} style={{ position: "relative" }}>
                        {reason && <div style={{ fontSize: 9, color: textMuted, letterSpacing: "0.5px", paddingTop: 16, textTransform: "uppercase" }}>{reason}</div>}
                        {!isOwn && (
                          <button className="hb" onClick={() => hideItem(item.id)} title="Not interested" style={{ position: "absolute", top: reason ? 14 : 28, right: 0, background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 11, fontFamily: "inherit", opacity: 0, transition: "opacity 0.15s" }}
                            onMouseEnter={e => e.currentTarget.style.opacity = "0.6"}
                            onMouseLeave={e => e.currentTarget.style.opacity = "0"}
                          >hide</button>
                        )}
                        <PostCard post={item} ctx={postCtx} />
                      </div>
                    );
                  })}

                {hasMoreFeed && (
                  <div style={{ padding: "24px 0", textAlign: "center" }}>
                    <button className="hb" onClick={() => setFeedPage(p => p + 1)}
                      style={{ ...btnG, padding: "10px 28px", fontSize: 12 }}>
                      load more
                    </button>
                  </div>
                )}
                </div>{/* end left column */}

                {/* Right: sidebar */}
                <div className="feed-right-sidebar" style={{ width: 260, flexShrink: 0, position: "sticky", top: 24, display: "flex", flexDirection: "column", gap: 28 }}>

                  {/* Suggested people */}
                  {suggestedPeople.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 12 }}>PEOPLE TO MEET</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 0, border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden" }}>
                        {suggestedPeople.map((u, i) => (
                          <div key={u.id} style={{ padding: "10px 14px", borderBottom: i < suggestedPeople.length - 1 ? `1px solid ${border}` : "none", display: "flex", gap: 10, alignItems: "center", background: bg2 }}>
                            <button onClick={() => setViewingProfile(u)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                              <Avatar initials={initials(u.name)} src={u.avatar_url} size={30} dark={dark} />
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <button onClick={() => setViewingProfile(u)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                                <div style={{ fontSize: 12, fontWeight: 500, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                              </button>
                              {u.overlap > 0 && <div style={{ fontSize: 10, color: textMuted }}>{u.overlap} skill{u.overlap !== 1 ? "s" : ""} in common</div>}
                              {u.skills?.length > 0 && <div style={{ fontSize: 10, color: textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.skills.slice(0, 2).join(" · ")}</div>}
                            </div>
                            <button className="hb" onClick={() => handleFollow(u.id)} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 6, border: `1px solid ${border}`, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, transition: "all 0.15s" }}>follow</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Open projects */}
                  {sidebarProjects.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 12 }}>OPEN PROJECTS</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 0, border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden" }}>
                        {sidebarProjects.map((p, i) => (
                          <div key={p.id} style={{ padding: "10px 14px", borderBottom: i < sidebarProjects.length - 1 ? `1px solid ${border}` : "none", background: bg2 }}>
                            <button className="hb" onClick={() => { setActiveProject(p); loadProjectData(p.id); setExploreTab("projects"); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", fontFamily: "inherit", width: "100%" }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                              <div style={{ fontSize: 10, color: textMuted }}>{p.category}{p.overlap > 0 ? ` · ${p.overlap} skill match` : ""}</div>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>{/* end sidebar */}
              </div>
            );
          })()}

          {/* SKILLS DEPOT TAB */}
        </div>
      )}

      {/* EXPLORE DETAIL */}
      {!viewFullProfile && appScreen === "explore" && activeProject && (
        <div className="pad fu" style={{ width: "100%", maxWidth: 700, margin: "0 auto", padding: "36px 24px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
            <button className="hb" onClick={() => setActiveProject(null)} style={{ ...btnG, padding: "6px 14px", fontSize: 11 }}>← back</button>
            <button className="hb" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/p/${activeProject.id}`).catch(() => {}); showToast("Link copied!"); }} style={{ ...btnG, padding: "6px 14px", fontSize: 11, marginLeft: "auto" }}>share ↗</button>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
            <button onClick={() => { const u = users.find(u => u.id === activeProject.owner_id); if (u) setViewingProfile(u); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <Avatar initials={activeProject.owner_initials} src={users.find(u => u.id === activeProject.owner_id)?.avatar_url} size={40} dark={dark} />
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
          {(activeProject.open_roles || []).length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div style={labelStyle}>OPEN ROLES</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {(activeProject.open_roles || []).map((role) => <span key={`active-role-${role}`} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${border}`, borderRadius: 999, color: textMuted }}>{role}</span>)}
              </div>
            </div>
          )}
          {getMatchScore(activeProject) > 0 && <div style={{ padding: "10px 14px", background: bg2, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12, color: textMuted, marginBottom: 18 }}>you match <strong style={{ color: text }}>{getMatchScore(activeProject)}</strong> of the skills needed.</div>}
          {appliedProjectIds.includes(activeProject.id)
            ? <div style={{ textAlign: "center", padding: 12, background: bg2, borderRadius: 8, color: textMuted, fontSize: 12, border: `1px solid ${border}` }}>applied — waiting to hear back</div>
            : activeProject.owner_id === authUser?.id
              ? <button className="hb" onClick={() => openReviewApplicants(activeProject)} style={{ ...btnP, width: "100%", padding: "13px" }}>review applicants ({applications.filter(a => a.project_id === activeProject.id && a.status === "pending").length})</button>
              : <button className="hb" onClick={() => openApplicationForm(activeProject)} style={{ ...btnP, width: "100%", padding: "13px" }}>Apply to collaborate →</button>
          }
        </div>
      )}

      {/* COMMUNITIES */}
      {!viewFullProfile && appScreen === "notifications" && (
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 6 }}>NOTIFICATIONS</div>
              <div style={{ fontSize: 20, color: text }}>All activity</div>
            </div>
            <button className="hb" onClick={markAllNotificationsRead} style={{ ...btnG, fontSize: 11 }}>mark all read</button>
          </div>
          {Object.values(notificationGroups).every((items) => items.length === 0) ? (
            <div style={{ fontSize: 14, color: textMuted, textAlign: "center", padding: "50px 0" }}>You're all caught up ✓</div>
          ) : (
            <div style={{ border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden" }}>
              {[
                ["replies", "Replies", "↩"],
                ["invites", "Invites", "✉"],
                ["taskAssigned", "Task assigned", "•"],
                ["follows", "Follows", "+"],
                ["applications", "Applications", "◈"],
                ["mentions", "Mentions", "@"],
              ].map(([key, label, icon]) => notificationGroups[key].length > 0 && (
                <div key={key}>
                  <div style={{ padding: "10px 14px", borderBottom: `1px solid ${border}`, fontSize: 10, color: textMuted, letterSpacing: "1px", background: bg2 }}>{label.toUpperCase()}</div>
                  {notificationGroups[key].map((n, idx) => (
                    <button
                      key={`${key}-${n.id}-${idx}`}
                      className="hb"
                      onClick={async () => {
                        if (!n.read && n._source !== "mention_notifications") {
                          await supabase.from("notifications").update({ read: true }).eq("id", n.id);
                          setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
                        }
                        if (n._source === "mention_notifications" && !n.read) {
                          await supabase.from("mention_notifications").update({ read: true }).eq("id", n.id);
                          setMentionNotifications((prev) => prev.filter((item) => item.id !== n.id));
                        }
                        if (n.type === "follow" || key === "follows") {
                          const u = users.find((x) => x.id === (n.userId || n.entity_id || n.entityId));
                          if (u) setViewingProfile(u);
                          return;
                        }
                        if (String(n.type || "").includes("reply") || String(n.type || "").includes("community")) {
                          setAppScreen("communities");
                          return;
                        }
                        if (n.project_id || n.projectId) {
                          const proj = projects.find((p) => p.id === (n.project_id || n.projectId));
                          if (proj) { setActiveProject(proj); loadProjectData(proj.id); setAppScreen("workspace"); setProjectTab("tasks"); }
                          return;
                        }
                        if (n.postId) { setAppScreen("network"); return; }
                        if (n.entity_id || n.entityId) {
                          const u = users.find((x) => x.id === (n.entity_id || n.entityId));
                          if (u) setViewingProfile(u);
                        }
                      }}
                      style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${border}`, padding: "12px 14px", cursor: "pointer", fontFamily: "inherit", display: "flex", justifyContent: "space-between", gap: 12 }}
                    >
                      <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                        <span style={{ color: textMuted }}>{icon}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: text }}>
                            {n.type === "follow"
                              ? `${users.find((u) => u.id === (n.userId || n.entity_id || n.entityId))?.name || "Someone"} followed you`
                              : n.text || `${n.from_name || "Someone"} mentioned you`}
                          </div>
                          <div style={{ fontSize: 11, color: textMuted }}>{relativeTime(n.createdAt || n.created_at)}</div>
                        </div>
                      </div>
                      {!n.read && <span style={{ width: 7, height: 7, borderRadius: "50%", background: text, marginTop: 5, flexShrink: 0 }} />}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!viewFullProfile && appScreen === "communities" && (() => {
        const joinedCommunities = communities.filter(c => joinedCommunityIds.includes(c.id));
        const otherCommunities = communities.filter(c => !joinedCommunityIds.includes(c.id));

        const loadCommunity = async (community) => {
          setActiveCommunity(community);
          setShowCommunityDrawer(false);
          setActiveThread(null);
          setCommunityPostPage(1);
          setCommunityPostsLoading(true);
          const { posts } = await fetchCommunityPosts(community.id);
          setCommunityPosts(posts);
          setCommunityPostsLoading(false);
        };

        const handleJoin = async (communityId) => {
          const { error } = await supabase.from("community_members").insert({ community_id: communityId, user_id: authUser.id });
          if (!error) setJoinedCommunityIds(prev => [...prev, communityId]);
        };

        const handleLeave = async (communityId) => {
          await supabase.from("community_members").delete().eq("community_id", communityId).eq("user_id", authUser.id);
          setJoinedCommunityIds(prev => prev.filter(id => id !== communityId));
          if (activeCommunity?.id === communityId) { setActiveCommunity(null); setCommunityPosts([]); }
        };

        const handleVote = async (post) => {
          const hasVoted = communityVotes[post.id];
          if (hasVoted) {
            await supabase.from("community_post_votes").delete().eq("post_id", post.id).eq("user_id", authUser.id);
            await supabase.from("community_posts").update({ upvotes: Math.max(0, post.upvotes - 1) }).eq("id", post.id);
            setCommunityVotes(prev => { const n = { ...prev }; delete n[post.id]; return n; });
            setCommunityPosts(prev => prev.map(p => p.id === post.id ? { ...p, upvotes: Math.max(0, p.upvotes - 1) } : p));
          } else {
            // clear any downvote first
            if (communityDownvotes[post.id]) {
              await supabase.from("community_post_downvotes").delete().eq("post_id", post.id).eq("user_id", authUser.id);
              setCommunityDownvotes(prev => { const n = { ...prev }; delete n[post.id]; return n; });
            }
            await supabase.from("community_post_votes").insert({ post_id: post.id, user_id: authUser.id });
            await supabase.from("community_posts").update({ upvotes: post.upvotes + 1 }).eq("id", post.id);
            setCommunityVotes(prev => ({ ...prev, [post.id]: true }));
            setCommunityPosts(prev => prev.map(p => p.id === post.id ? { ...p, upvotes: p.upvotes + 1 } : p));
          }
        };

        const handleDownvote = async (post) => {
          const hasDownvoted = communityDownvotes[post.id];
          if (hasDownvoted) {
            await supabase.from("community_post_downvotes").delete().eq("post_id", post.id).eq("user_id", authUser.id);
            await supabase.from("community_posts").update({ upvotes: post.upvotes + 1 }).eq("id", post.id);
            setCommunityDownvotes(prev => { const n = { ...prev }; delete n[post.id]; return n; });
            setCommunityPosts(prev => prev.map(p => p.id === post.id ? { ...p, upvotes: post.upvotes + 1 } : p));
          } else {
            // clear any upvote first
            if (communityVotes[post.id]) {
              await supabase.from("community_post_votes").delete().eq("post_id", post.id).eq("user_id", authUser.id);
              setCommunityVotes(prev => { const n = { ...prev }; delete n[post.id]; return n; });
            }
            await supabase.from("community_post_downvotes").insert({ post_id: post.id, user_id: authUser.id });
            await supabase.from("community_posts").update({ upvotes: post.upvotes - 1 }).eq("id", post.id);
            setCommunityDownvotes(prev => ({ ...prev, [post.id]: true }));
            setCommunityPosts(prev => prev.map(p => p.id === post.id ? { ...p, upvotes: post.upvotes - 1 } : p));
          }
        };

        const handleCreatePost = async () => {
          if (!newThreadTitle.trim() || !activeCommunity) return;
          const payload = {
            community_id: activeCommunity.id,
            user_id: authUser.id,
            user_name: profile.name,
            user_initials: myInitials,
            title: newThreadTitle.trim(),
            content: newThreadContent.trim() || null,
            upvotes: 0,
            comment_count: 0,
          };
          const { data, error } = await supabase.from("community_posts").insert(payload).select().single();
          if (!error && data) {
            setCommunityPosts(prev => [data, ...prev]);
            setNewThreadTitle("");
            setNewThreadContent("");
            setShowCreatePost(false);
            showToast("Thread posted.");
          }
        };

        const handleCreateCommunity = async () => {
          if (!newCommunityName.trim()) return;
          const slug = await resolveCommunitySlug(newCommunityName);
          const payload = { name: newCommunityName.trim(), slug, description: newCommunityDesc.trim() || null, emoji: newCommunityEmoji, created_by: authUser.id };
          const { data, error } = await supabase.from("communities").insert(payload).select().single();
          if (error) { showToast("Community name taken or invalid."); return; }
          if (data) {
            setCommunities(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
            await supabase.from("community_members").insert({ community_id: data.id, user_id: authUser.id, role: "admin" });
            setJoinedCommunityIds(prev => [...prev, data.id]);
            setNewCommunityName("");
            setNewCommunityDesc("");
            setNewCommunityEmoji("◈");
            setShowCreateCommunity(false);
            loadCommunity(data);
            showToast("Community created.");
          }
        };

        const openThread = async (post) => {
          setActiveThread(post);
          setNewCommentText("");
          if (!threadComments[post.id]) {
            const comments = await fetchThreadComments(post.id);
            setThreadComments(prev => ({ ...prev, [post.id]: comments }));
          }
        };

        const handleAddComment = async (postId, content) => {
          if (!content.trim()) return;
          const payload = { post_id: postId, user_id: authUser.id, user_name: profile.name, user_initials: myInitials, content: content.trim() };
          const { data } = await supabase.from("community_comments").insert(payload).select().single();
          if (data) {
            const post = communityPosts.find((p) => p.id === postId) || activeThread;
            setThreadComments(prev => ({ ...prev, [postId]: [...(prev[postId] || []), data] }));
            await supabase.from("community_posts").update({ comment_count: (activeThread?.comment_count || 0) + 1 }).eq("id", postId);
            setActiveThread(prev => prev ? { ...prev, comment_count: (prev.comment_count || 0) + 1 } : prev);
            setCommunityPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p));
            if (post?.user_id && post.user_id !== authUser.id) {
              await supabase.from("notifications").insert({
                user_id: post.user_id,
                type: "reply",
                text: `${authUser?.user_metadata?.display_name || profile?.name || "Someone"} replied to your thread`,
                entity_id: post.id,
                project_id: null,
                read: false,
              });
            }
          }
        };

        const handleDeletePost = async (postId) => {
          if (!window.confirm("Delete this thread?")) return;
          await supabase.from("community_posts").delete().eq("id", postId).eq("user_id", authUser.id);
          setCommunityPosts(prev => prev.filter(p => p.id !== postId));
          if (activeThread?.id === postId) setActiveThread(null);
          showToast("Thread deleted.");
        };

        const handleEditPost = async (postId, newContent) => {
          await supabase.from("community_posts").update({ content: newContent }).eq("id", postId).eq("user_id", authUser.id);
          setCommunityPosts(prev => prev.map(p => p.id === postId ? { ...p, content: newContent } : p));
          if (activeThread?.id === postId) setActiveThread(prev => prev ? { ...prev, content: newContent } : prev);
          setEditingPostId(null);
          showToast("Thread updated.");
        };

        const handleDeleteComment = async (commentId, postId) => {
          await supabase.from("community_comments").delete().eq("id", commentId).eq("user_id", authUser.id);
          setThreadComments(prev => ({ ...prev, [postId]: (prev[postId] || []).filter(c => c.id !== commentId) }));
          await supabase.from("community_posts").update({ comment_count: Math.max(0, (activeThread?.comment_count || 1) - 1) }).eq("id", postId);
          setActiveThread(prev => prev ? { ...prev, comment_count: Math.max(0, (prev.comment_count || 1) - 1) } : prev);
        };

        const filteredCommunities = communitySearch.trim()
          ? communities.filter(c => c.name.toLowerCase().includes(communitySearch.toLowerCase()))
          : communities;
        const joinedFiltered = filteredCommunities.filter(c => joinedCommunityIds.includes(c.id));
        const otherFiltered = filteredCommunities.filter(c => !joinedCommunityIds.includes(c.id));

        const sortedPosts = [...communityPosts].sort((a, b) => {
          if (communitySort === "hot") {
            const ageA = (Date.now() - new Date(a.created_at).getTime()) / 3600000;
            const ageB = (Date.now() - new Date(b.created_at).getTime()) / 3600000;
            const scoreA = (a.upvotes * 2 + a.comment_count * 1.5) * Math.exp(-ageA / 48);
            const scoreB = (b.upvotes * 2 + b.comment_count * 1.5) * Math.exp(-ageB / 48);
            return scoreB - scoreA;
          }
          if (communitySort === "top") return b.upvotes - a.upvotes;
          return new Date(b.created_at) - new Date(a.created_at); // new
        });

        const CommunityListItem = ({ c }) => {
          const isJoined = joinedCommunityIds.includes(c.id);
          const isActive = activeCommunity?.id === c.id;
          return (
            <div onClick={() => loadCommunity(c)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 6, cursor: "pointer", background: isActive ? bg3 : "none", transition: "background 0.1s" }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = bg2; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "none"; }}>
              <span style={{ fontSize: 13, flexShrink: 0, color: isActive ? text : textMuted, fontFamily: "inherit", lineHeight: 1 }}>{COMMUNITY_SYMBOLS[c.slug] || c.emoji}</span>
              <span style={{ flex: 1, fontSize: 12, color: isActive ? text : textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              <button className="hb" onClick={e => { e.stopPropagation(); isJoined ? handleLeave(c.id) : handleJoin(c.id); }}
                style={{ fontSize: 10, padding: "3px 9px", borderRadius: 6, border: `1px solid ${border}`, background: "none", color: isJoined ? text : textMuted, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, letterSpacing: "0.2px" }}>
                {isJoined ? "joined ✓" : "+ join"}
              </button>
            </div>
          );
        };

        return (
          <div className="communities-wrap" style={{ display: "flex", height: "calc(100vh - 50px)", overflow: "hidden" }}>
            {showCommunityDrawer && <div onClick={() => setShowCommunityDrawer(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 220 }} />}

            {/* Left sidebar */}
            <div className={`communities-sidebar ${showCommunityDrawer ? "open" : ""}`} style={{ width: 240, borderRight: `1px solid ${border}`, display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" }}>
              <div style={{ padding: "24px 16px 12px" }}>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 12 }}>COMMUNITIES</div>
                <input
                  value={communitySearch}
                  onChange={e => setCommunitySearch(e.target.value)}
                  placeholder="search..."
                  style={{ ...inputStyle, fontSize: 11, padding: "6px 10px", marginBottom: 14, width: "100%", boxSizing: "border-box" }}
                />

                {joinedFiltered.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 9, color: textMuted, letterSpacing: "1.5px", marginBottom: 6, paddingLeft: 12 }}>JOINED</div>
                    {joinedFiltered.map(c => <CommunityListItem key={c.id} c={c} />)}
                  </div>
                )}

                {otherFiltered.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 9, color: textMuted, letterSpacing: "1.5px", marginBottom: 6, paddingLeft: 12 }}>ALL COMMUNITIES</div>
                    {otherFiltered.map(c => <CommunityListItem key={c.id} c={c} />)}
                  </div>
                )}

                {filteredCommunities.length === 0 && communitySearch && (
                  <div style={{ fontSize: 12, color: textMuted, paddingLeft: 12 }}>no results</div>
                )}
              </div>

              <div style={{ padding: "0 16px 24px", marginTop: "auto" }}>
                <button className="hb" onClick={() => setShowCreateCommunity(true)}
                  style={{ width: "100%", padding: "8px 12px", fontSize: 11, borderRadius: 6, border: `1px solid ${border}`, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                  + create community
                </button>
              </div>
            </div>

            {/* Main area */}
            <div className="communities-main" style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
              {!activeCommunity ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
                  <button className="hb community-drawer-toggle" onClick={() => setShowCommunityDrawer(true)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, cursor: "pointer", color: textMuted, fontFamily: "inherit" }}>☰ communities</button>
                  <div style={{ fontSize: 32 }}>...</div>
                  <div style={{ fontSize: 14, color: textMuted }}>Select a community to browse threads</div>
                  {joinedCommunities.length === 0 && <div style={{ fontSize: 12, color: textMuted, opacity: 0.6 }}>Join a community on the left to get started</div>}
                </div>
              ) : activeThread ? (
                /* Thread detail */
                <div className="community-main-inner" style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 40px" }}>
                  <button className="hb community-drawer-toggle" onClick={() => setShowCommunityDrawer(true)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, cursor: "pointer", color: textMuted, fontFamily: "inherit", marginBottom: 12 }}>☰ communities</button>
                  <button className="hb" onClick={() => setActiveThread(null)}
                    style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, marginBottom: 24, padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
                    ← back to {activeCommunity.name}
                  </button>
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 24 }}>
                    {/* Vote */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <button className="hb" onClick={() => handleVote(activeThread)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: communityVotes[activeThread.id] ? text : textMuted, lineHeight: 1, padding: "2px 6px" }}>+</button>
                      <span style={{ fontSize: 13, fontWeight: 500, color: text }}>{activeThread.upvotes}</span>
                      <button className="hb" onClick={() => handleDownvote(activeThread)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: communityDownvotes[activeThread.id] ? text : textMuted, lineHeight: 1, padding: "2px 6px" }}>−</button>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 20, fontWeight: 400, letterSpacing: "-0.5px", color: text, marginBottom: 10, lineHeight: 1.3 }}>{activeThread.title}</div>
                      <div style={{ fontSize: 11, color: textMuted, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                        <span>{activeThread.user_name} · {relativeTime(activeThread.created_at)}</span>
                        <button className="hb" onClick={() => openReportModal({ contentType: "community_post", contentId: activeThread.id, label: "thread" })} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit", padding: 0, textDecoration: "underline" }}>report</button>
                        {activeThread.user_id === authUser?.id && (
                          <span style={{ display: "flex", gap: 8 }}>
                            <button className="hb" onClick={() => { setEditingPostId(activeThread.id); setEditingPostContent(activeThread.content || ""); }}
                              style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit", padding: 0, textDecoration: "underline" }}>edit</button>
                            <button className="hb" onClick={() => handleDeletePost(activeThread.id)}
                              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 10, fontFamily: "inherit", padding: 0, textDecoration: "underline" }}>delete</button>
                          </span>
                        )}
                      </div>
                      {editingPostId === activeThread.id ? (
                        <div style={{ marginBottom: 24 }}>
                          <textarea value={editingPostContent} onChange={e => setEditingPostContent(e.target.value)}
                            style={{ ...inputStyle, resize: "none", fontSize: 13, padding: "12px", minHeight: 80, width: "100%", boxSizing: "border-box" }} rows={4} />
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <button className="hb" onClick={() => handleEditPost(activeThread.id, editingPostContent)} style={{ ...btnP, padding: "6px 16px", fontSize: 11 }}>save</button>
                            <button className="hb" onClick={() => setEditingPostId(null)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "6px 14px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", color: textMuted }}>cancel</button>
                          </div>
                        </div>
                      ) : activeThread.content ? (
                        <div style={{ fontSize: 13, color: text, lineHeight: 1.75, whiteSpace: "pre-wrap", marginBottom: 24, padding: "16px", background: bg2, borderRadius: 8, border: `1px solid ${border}` }}>
                          {activeThread.content}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Comments */}
                  <div style={{ borderTop: `1px solid ${border}`, paddingTop: 24 }}>
                    <div style={{ fontSize: 12, color: textMuted, letterSpacing: "1px", marginBottom: 20 }}>
                      {(threadComments[activeThread.id] || []).length} COMMENT{(threadComments[activeThread.id] || []).length !== 1 ? "S" : ""}
                    </div>

                    {/* Comment composer */}
                    <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
                      <Avatar initials={myInitials} src={profile?.avatar_url} size={28} dark={dark} />
                      <div style={{ flex: 1 }}>
                        <MentionInput
                          value={newCommentText}
                          onChange={setNewCommentText}
                          placeholder="add a comment..."
                          users={users}
                          following={following}
                          followers={followers}
                          dark={dark}
                          rows={2}
                          style={{ ...inputStyle, resize: "none", fontSize: 12, padding: "8px 12px", minHeight: 60, width: "100%", boxSizing: "border-box" }}
                        />
                        {newCommentText.trim() && (
                          <button className="hb" onClick={async () => {
                            const text = newCommentText;
                            setNewCommentText("");
                            await handleAddComment(activeThread.id, text);
                          }} style={{ ...btnP, marginTop: 6, padding: "6px 14px", fontSize: 11 }}>reply</button>
                        )}
                      </div>
                    </div>

                    {/* Comments list */}
                    {(threadComments[activeThread.id] || []).map(c => (
                      <div key={c.id} style={{ display: "flex", gap: 10, marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${border}` }}>
                        <Avatar initials={c.user_initials} src={users.find(u => u.id === c.user_id)?.avatar_url} size={28} dark={dark} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, fontWeight: 500, color: text }}>{c.user_name}</span>
                            <span style={{ fontSize: 10, color: textMuted }}>{relativeTime(c.created_at)}</span>
                            {c.user_id === authUser?.id && (
                              <button className="hb" onClick={() => handleDeleteComment(c.id, activeThread.id)}
                                style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 10, fontFamily: "inherit", padding: 0, textDecoration: "underline", marginLeft: 4 }}>delete</button>
                            )}
                            <button className="hb" onClick={() => openReportModal({ contentType: "comment", contentId: c.id, label: "comment" })}
                              style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit", padding: 0, textDecoration: "underline", marginLeft: 2 }}>report</button>
                          </div>
                          <div style={{ fontSize: 13, color: text, lineHeight: 1.65 }}>{c.content}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Thread list */
                <div className="community-main-inner" style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 40px" }}>
                  <button className="hb community-drawer-toggle" onClick={() => setShowCommunityDrawer(true)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, cursor: "pointer", color: textMuted, fontFamily: "inherit", marginBottom: 12 }}>☰ communities</button>
                  {/* Community header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 18, color: text, fontFamily: "inherit", lineHeight: 1 }}>{COMMUNITY_SYMBOLS[activeCommunity.slug] || activeCommunity.emoji}</span>
                        <div style={{ fontSize: 22, fontWeight: 400, letterSpacing: "-0.5px", color: text }}>{activeCommunity.name}</div>
                      </div>
                      {activeCommunity.description && <div style={{ fontSize: 12, color: textMuted, maxWidth: 480, lineHeight: 1.6 }}>{activeCommunity.description}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {joinedCommunityIds.includes(activeCommunity.id) ? (
                        <button className="hb" onClick={() => setShowCreatePost(true)} style={{ ...btnP, padding: "8px 16px", fontSize: 12 }}>+ new thread</button>
                      ) : (
                        <button className="hb" onClick={() => handleJoin(activeCommunity.id)} style={{ ...btnP, padding: "8px 16px", fontSize: 12 }}>+ join to post</button>
                      )}
                    </div>
                  </div>

                  {/* Sort tabs */}
                  <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${border}`, marginBottom: 20 }}>
                    {["hot", "new", "top"].map(s => (
                      <button key={s} className="hb" onClick={() => setCommunitySort(s)}
                        style={{ background: "none", border: "none", borderBottom: communitySort === s ? `1px solid ${text}` : "1px solid transparent", color: communitySort === s ? text : textMuted, padding: "8px 16px 8px 0", fontSize: 11, cursor: "pointer", fontFamily: "inherit", marginRight: 12, transition: "all 0.15s" }}>
                        {s}
                      </button>
                    ))}
                  </div>

                  {/* Threads */}
                  {communityPostsLoading ? <Spinner dark={dark} /> : sortedPosts.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "48px 18px", color: textMuted, fontSize: 13, background: bg2, border: `1px solid ${border}`, borderRadius: 10 }}>
                      {joinedCommunityIds.includes(activeCommunity.id) ? "No threads yet. Be the first to post." : "Join this community to start the conversation."}
                    </div>
                  ) : (() => {
                    const POSTS_PER_PAGE = 15;
                    const pagedPosts = sortedPosts.slice(0, (communityPostPage || 1) * POSTS_PER_PAGE);
                    const hasMorePosts = pagedPosts.length < sortedPosts.length;
                    return (<>
                    {pagedPosts.map(post => (
                    <div key={post.id} role="article" onClick={() => openThread(post)}
                      style={{ display: "flex", gap: 14, padding: "16px 0", borderBottom: `1px solid ${border}`, cursor: "pointer", transition: "opacity 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
                      onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                      {/* Vote */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0, width: 36 }}>
                        <button aria-label="upvote" className="hb" onClick={e => { e.stopPropagation(); handleVote(post); }}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: communityVotes[post.id] ? text : textMuted, padding: "2px", lineHeight: 1 }}>+</button>
                        <span style={{ fontSize: 12, fontWeight: 500, color: communityVotes[post.id] ? text : communityDownvotes[post.id] ? textMuted : textMuted }}>{post.upvotes}</span>
                        <button aria-label="downvote" className="hb" onClick={e => { e.stopPropagation(); handleDownvote(post); }}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: communityDownvotes[post.id] ? text : textMuted, padding: "2px", lineHeight: 1 }}>−</button>
                      </div>
                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: text, fontWeight: 400, letterSpacing: "-0.2px", marginBottom: 6, lineHeight: 1.4 }}>{post.title}</div>
                        {post.content && <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.5, marginBottom: 8, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{post.content}</div>}
                        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, color: textMuted }}>{post.user_name}</span>
                          <span style={{ fontSize: 10, color: textMuted }}>{relativeTime(post.created_at)}</span>
                          <span style={{ fontSize: 10, color: textMuted }}>... {post.comment_count}</span>
                        </div>
                      </div>
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <button className="hb" onClick={(e) => { e.stopPropagation(); setCommunityMenuOpenId((prev) => (prev === post.id ? null : post.id)); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>⋯</button>
                        {communityMenuOpenId === post.id && (
                          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", right: 0, top: 20, minWidth: 120, background: dark ? "#111" : "#fff", border: `1px solid ${border}`, borderRadius: 8, zIndex: 12 }}>
                            <button className="hb" onClick={() => openReportModal({ contentType: "community_post", contentId: post.id, label: "thread" })} style={{ width: "100%", textAlign: "left", background: "none", border: "none", color: text, padding: "8px 10px", fontSize: 11, fontFamily: "inherit" }}>report</button>
                            {post.user_id === authUser?.id && <button className="hb" onClick={() => { setEditingPostId(post.id); setEditingPostContent(post.content || ""); setCommunityMenuOpenId(null); openThread(post); }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", color: text, padding: "8px 10px", fontSize: 11, fontFamily: "inherit" }}>edit</button>}
                            {post.user_id === authUser?.id && <button className="hb" onClick={() => { handleDeletePost(post.id); setCommunityMenuOpenId(null); }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", color: "#ef4444", padding: "8px 10px", fontSize: 11, fontFamily: "inherit" }}>delete</button>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {hasMorePosts && (
                    <div style={{ padding: "20px 0", textAlign: "center" }}>
                      <button className="hb" onClick={() => setCommunityPostPage(p => p + 1)}
                        style={{ ...btnG, padding: "10px 28px", fontSize: 12 }}>load more</button>
                    </div>
                  )}
                  </>);
                })()}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* NETWORK */}
      {!viewFullProfile && appScreen === "network" && renderNetwork()}

      {/* MESSAGES */}
      {!viewFullProfile && appScreen === "messages" && (
        <div className={activeDmThread ? "msgs-has-thread" : "msgs-no-thread"} style={{ width: "100%", padding: "0", display: "flex", height: "calc(100vh - 50px)" }}>
          {/* Left panel — thread list */}
          <div className="msgs-left" style={{ width: 260, flexShrink: 0, borderRight: `1px solid ${border}`, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 20px 12px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px" }}>MESSAGES</div>
              <button className="hb" onClick={() => { setShowNewDm(true); setNewDmSearch(""); }} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 5, width: 22, height: 22, cursor: "pointer", fontSize: 14, color: textMuted, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>+</button>
            </div>
            {dmThreads.length > 0 && (
              <div style={{ padding: "8px 12px", borderBottom: `1px solid ${border}` }}>
                <input
                  placeholder="search..."
                  value={dmSearchQuery || ""}
                  onChange={e => setDmSearchQuery(e.target.value)}
                  style={{ ...inputStyle, fontSize: 11, padding: "5px 9px", width: "100%", boxSizing: "border-box" }}
                />
              </div>
            )}
            {dmThreads.length === 0
              ? <div style={{ padding: "24px 20px", fontSize: 12, color: textMuted, lineHeight: 1.7 }}>
                  No conversations yet.<br />
                  <button className="hb" onClick={() => { setShowNewDm(true); setNewDmSearch(""); }} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline", padding: 0 }}>+ new message</button>
                </div>
              : dmThreads.filter(thread => {
                  if (!dmSearchQuery?.trim()) return true;
                  const otherId = thread.user_a === authUser?.id ? thread.user_b : thread.user_a;
                  const other = users.find(u => u.id === otherId);
                  return other?.name?.toLowerCase().includes(dmSearchQuery.toLowerCase());
                }).map(thread => {
                  const otherId = thread.user_a === authUser?.id ? thread.user_b : thread.user_a;
                  const other = users.find(u => u.id === otherId);
                  if (!other) return null;
                  const isActive = activeDmThread?.id === thread.id;
                  const threadMsgs = dmMessages[thread.id] || [];
                  const lastMsg = threadMsgs[threadMsgs.length - 1];
                  const unreadCount = threadMsgs.filter(m => m.sender_id !== authUser?.id && !(m.read_by || []).includes(authUser?.id)).length;
                  const lastMsgPrefix = lastMsg?.sender_id === authUser?.id ? "you: " : "";
                  const lastMsgText = lastMsg ? `${lastMsgPrefix}${lastMsg.text}` : null;
                  const lastMsgTruncated = lastMsgText ? (lastMsgText.length > 35 ? lastMsgText.slice(0, 35) + "…" : lastMsgText) : null;
                  return (
                    <div key={thread.id} onClick={() => openDmThread({ thread, otherUser: other })}
                      style={{ padding: "14px 20px", borderBottom: `1px solid ${border}`, cursor: "pointer", background: isActive ? bg2 : "none", display: "flex", gap: 12, alignItems: "center" }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = bg2; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "none"; }}>
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <Avatar initials={initials(other.name)} src={other.avatar_url} size={36} dark={dark} />
                        {unreadCount > 0 && <span style={{ position: "absolute", top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, background: text, color: bg, fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: `2px solid ${bg}`, lineHeight: 1 }}>{unreadCount}</span>}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, color: text, fontWeight: unreadCount > 0 ? 500 : 400 }}>{other.name}</div>
                        {lastMsgTruncated
                          ? <div style={{ fontSize: 11, color: textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lastMsgTruncated}{lastMsg?.created_at ? ` · ${relativeTime(lastMsg.created_at)}` : ""}</div>
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
                  <Avatar initials={initials(activeDmThread.otherUser?.name)} src={activeDmThread.otherUser?.avatar_url} size={32} dark={dark} />
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
                    : (() => {
                        const activeMsgs = dmMessages[activeDmThread.id] || [];
                        const lastSentIdx = activeMsgs.reduce((acc, m, i) => m.sender_id === authUser?.id ? i : acc, -1);
                        return activeMsgs.map((msg, i) => {
                          const isMe = msg.sender_id === authUser?.id;
                          const isEditing = editingMessage?.id === msg.id;
                          const otherUserId = activeDmThread.otherUser?.id;
                          const isLastSent = isMe && i === lastSentIdx;
                          const seenByOther = isLastSent && otherUserId && (msg.read_by || []).includes(otherUserId);
                          return (
                            <div key={msg.id || i} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexDirection: isMe ? "row-reverse" : "row" }}>
                              <Avatar initials={msg.sender_initials} src={users.find(u => u.id === msg.sender_id)?.avatar_url} size={26} dark={dark} />
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
                                  {isMe && <button className="hb" onClick={() => { setEditingMessage({ id: msg.id }); setEditMessageText(msg.text); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>edit</button>}
                                  {isMe && <button className="hb" onClick={() => handleDeleteDm(msg.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>delete</button>}
                                </div>
                                {seenByOther && <div style={{ fontSize: 9, color: textMuted, textAlign: "right", marginTop: 1 }}>seen</div>}
                              </div>
                            </div>
                          );
                        });
                      })()
                  }
                  <div ref={dmEndRef} />
                </div>
                {dmTypingUser && <div style={{ padding: "4px 20px 0", fontSize: 11, color: textMuted, fontStyle: "italic" }}>{dmTypingUser} is typing...</div>}
                <div style={{ padding: "14px 20px", borderTop: `1px solid ${border}`, display: "flex", gap: 10 }}>
                  <input placeholder="message..." value={dmInput} onChange={e => setDmInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSendDm()} style={{ ...inputStyle, fontSize: 13 }} autoFocus={window.innerWidth > 768} />
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
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 12 }}>
                {dmThreads.length > 0 ? (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 13, color: textMuted, marginBottom: 8 }}>Select a conversation</div>
                    <div style={{ fontSize: 11, color: textMuted, opacity: 0.6 }}>or start a new one →</div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 13, color: text, marginBottom: 6 }}>No messages yet</div>
                    <div style={{ fontSize: 12, color: textMuted, marginBottom: 16, lineHeight: 1.6 }}>Message your collaborators or anyone on CoLab</div>
                    {(myCollaborators || []).slice(0, 3).length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 4 }}>YOUR COLLABORATORS</div>
                        {(myCollaborators || []).slice(0, 3).map((c) => (
                          <button key={c.user.id} className="hb" onClick={() => openDm(c.user)}
                            style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 6, padding: "7px 14px", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                            <Avatar initials={initials(c.user.name)} src={c.user.avatar_url} size={22} dark={dark} />
                            {c.user.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <button className="hb" onClick={() => { setShowNewDm(true); setNewDmSearch(""); }}
                      style={{ ...btnP, marginTop: 14, fontSize: 12 }}>+ new message</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* WORKSPACE */}
      {!viewFullProfile && appScreen === "workspace" && !activeProject && (
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
          <div style={{ display: "flex", gap: 24, marginBottom: 36 }}>
            <span style={{ fontSize: 13, color: textMuted }}><span style={{ color: text, fontWeight: 500 }}>{myProjects.length}</span> projects</span>
            <span style={{ fontSize: 13, color: textMuted }}><span style={{ color: text, fontWeight: 500 }}>{appliedProjectIds.length}</span> applied to</span>
          </div>

          {/* Two col: my projects + applications */}
          {(() => {
            const collaboratingProjects = applications
              .filter(a => a.applicant_id === authUser?.id && normalizeApplicationStatus(a.status) === "accepted")
              .map(a => projects.find(p => p.id === a.project_id))
              .filter(Boolean);
            return (
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
                            <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                              {pendingApps > 0 && <button className="hb" onClick={e => { e.stopPropagation(); openReviewApplicants(p); }} style={{ fontSize: 10, padding: "2px 8px", border: `1px solid ${border}`, borderRadius: 4, background: "none", color: text, cursor: "pointer", fontFamily: "inherit" }}>review</button>}
                              {!p.shipped && <button className="hb" onClick={e => { e.stopPropagation(); handleArchiveProject(p.id); }} style={{ fontSize: 10, padding: "2px 8px", border: "none", borderRadius: 4, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", opacity: 0.5 }} title="Archive project">archive</button>}
                            </div>
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
            {/* Collaborating on */}
            {collaboratingProjects.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 14 }}>COLLABORATING ON</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {collaboratingProjects.map((p, i, arr) => (
                    <div key={p.id}
                      style={{ background: bg2, borderRadius: i === 0 && arr.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === arr.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < arr.length - 1 ? "none" : `1px solid ${border}`, padding: "12px 16px", cursor: "pointer", transition: "opacity 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
                      onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                      onClick={() => { setActiveProject(p); loadProjectData(p.id); setProjectTab("tasks"); }}>
                      <div style={{ fontSize: 13, color: text, letterSpacing: "-0.3px", marginBottom: 2 }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: textMuted }}>{p.owner_name} · {p.category}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>

            {/* Applications + recent activity */}
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 14 }}>APPLICATIONS</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {Object.entries(applicationStatusStyles).map(([statusKey, config]) => {
                  const count = applications.filter((application) => application.applicant_id === authUser?.id && normalizeApplicationStatus(application.status) === statusKey).length;
                  return (
                    <span key={statusKey} style={{ fontSize: 10, color: config.color, border: `1px solid ${config.color}66`, borderRadius: 999, padding: "2px 8px" }}>
                      {config.label}: {count}
                    </span>
                  );
                })}
              </div>
              {(() => {
                const pendingOrRejectedProjects = projects.filter(p => {
                  if (!appliedProjectIds.includes(p.id)) return false;
                  const myApp = applications.find(a => a.project_id === p.id && a.applicant_id === authUser?.id);
                  return normalizeApplicationStatus(myApp?.status) !== "accepted";
                });
                return pendingOrRejectedProjects.length === 0
                  ? <div style={{ fontSize: 12, color: textMuted, marginBottom: 24 }}>no pending applications.</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: 24 }}>
                      {pendingOrRejectedProjects.map((p,i,arr) => {
                        const myApp = applications.find(a => a.project_id === p.id && a.applicant_id === authUser?.id);
                        return (
                          <div key={p.id} style={{ background: bg2, borderRadius: i === 0 && arr.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === arr.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < arr.length - 1 ? "none" : `1px solid ${border}`, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                            <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, color: text, marginBottom: 1 }}>{p.title}</div><div style={{ fontSize: 10, color: textMuted }}>{p.owner_name}</div></div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                              <span style={{ fontSize: 10, color: textMuted, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px" }}>{normalizeApplicationStatus(myApp?.status || "pending")}</span>
                              {normalizeApplicationStatus(myApp?.status) === "rejected" && <button className="hb" onClick={() => handleRemoveDeniedApp(myApp.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>✕</button>}
                            </div>
                          </div>
                        );
                      })}
                    </div>;
              })()}

              {/* Pending notifications — project-relevant only */}
              {notifications.filter(n => n.type !== "follow").length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 14 }}>NEEDS ATTENTION</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {notifications.filter(n => n.type !== "follow").slice(0, 3).map(n => (
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
          ); })()}
        </div>
      )}

      {/* PROJECT SPACE */}
      {!viewFullProfile && appScreen === "workspace" && activeProject && (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", height: "calc(100vh - 50px)" }}>
          {activeProject.cover_image_url && (
            <div style={{ padding: "12px 28px 0" }}>
              <img src={activeProject.cover_image_url} alt={`${activeProject.title} cover`} style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: "10px 10px 0 0", border: `1px solid ${border}` }} />
            </div>
          )}
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
                <>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, border: "1px solid #22c55e", color: "#22c55e" }}>shipped</span>
                  {!teamReviews.some(r => r.project_id === activeProject.id && r.reviewer_id === authUser?.id) && (
                    <button className="hb" onClick={() => setShowTeamReview(activeProject)} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 6, border: `1px solid ${border}`, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit" }}>+ rate team</button>
                  )}
                </>
              )}
              {activeProject.owner_id === authUser?.id && !activeProject.shipped && (
                <button className="hb" onClick={() => { setShipPostContent(`just deployed: ${activeProject.title}. built it with the team on CoLab.`); setShowDeployExplainer(true); }}
                  style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 10px", fontSize: 10, cursor: "pointer", color: textMuted, fontFamily: "inherit" }}>
                  deploy
                </button>
              )}
              {activeProject.owner_id === authUser?.id && (
                <label className="hb" style={{ ...btnG, padding: "4px 10px", fontSize: 10, cursor: "pointer" }}>
                  {coverUploading ? "uploading..." : "update cover"}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleUploadProjectCover(activeProject, e.target.files?.[0])} />
                </label>
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
            {shouldShowPluginsTab && <TabBtn id="plugins" label="plugins" count={(activeProject.plugins || []).length} setter={(id) => { setProjectTab(id); if (id === "plugins" && activeProject.github_repo) { setGithubRepoInput(activeProject.github_repo); loadGithubCommits(activeProject.github_repo); } }} current={projectTab} />}
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
                  <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value)} style={{ ...inputStyle, fontSize: 12, maxWidth: 120 }}>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
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
                    <div
                      key={col.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnter={() => setKanbanDropZone(col.id)}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget)) setKanbanDropZone(null);
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        setKanbanDropZone(null);
                        const taskId = e.dataTransfer.getData("taskId");
                        if (!taskId) return;
                        await moveTaskToColumn(taskId, col.id);
                      }}
                      style={{ background: kanbanDropZone === col.id ? (dark ? "#1d2735" : "#eef6ff") : bg2, borderRadius: 10, border: `1px solid ${kanbanDropZone === col.id ? "#60a5fa" : border}`, padding: "14px", minHeight: 200, transition: "background 0.16s ease, border-color 0.16s ease" }}
                    >
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
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("taskId", task.id);
                              e.dataTransfer.effectAllowed = "move";
                            }}
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
                              <div onClick={(e) => { e.stopPropagation(); setEditingTaskId(task.id); setEditingTaskTitle(task.text || ""); }} style={{ fontSize: 12, color: text, marginBottom: 6, lineHeight: 1.4, display: "flex", gap: 6, alignItems: "center" }}>
                                {task.priority && <span style={{ width: 4, height: 4, borderRadius: "50%", background: task.priority === "high" ? "#ef4444" : task.priority === "medium" ? "#f59e0b" : task.priority === "low" ? "#22c55e" : "transparent", flexShrink: 0 }} />}
                                {task.text}
                              </div>
                            )}
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              {assignee ? (
                                <>
                                  <Avatar initials={initials(assignee.name, "??")} src={assignee?.avatar_url} size={16} dark={dark} />
                                  <div style={{ fontSize: 10, color: textMuted }}>{assignee.name}</div>
                                  {isAssignedToMe && <span style={{ fontSize: 9, color: "#60a5fa" }}>you</span>}
                                </>
                              ) : (
                                <span style={{ fontSize: 9, color: "#f59e0b", border: "1px solid #f59e0b", borderRadius: 999, padding: "1px 7px" }}>unassigned</span>
                              )}
                            </div>
                            {due && <div style={{ fontSize: 10, color: isOverdue ? "#ef4444" : isDueSoon ? "#f97316" : textMuted, marginBottom: 8, fontWeight: isOverdue ? 500 : 400 }}>{isOverdue ? "overdue · " : isDueSoon ? "due soon · " : "due "}{due.toLocaleDateString()}</div>}
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {col.id !== "todo" && <button className="hb" onClick={async (e) => { e.stopPropagation(); await moveTaskToColumn(task.id, "todo"); }} style={{ fontSize: 9, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit" }}>← to do</button>}
                              {col.id === "todo" && <button className="hb" onClick={async (e) => { e.stopPropagation(); await moveTaskToColumn(task.id, "inprogress"); }} style={{ fontSize: 9, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit" }}>in progress →</button>}
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
                      <div>
                        <label style={labelStyle}>PRIORITY</label>
                        <select value={taskEditorDraft.priority || "medium"} onChange={(e) => setTaskEditorDraft((prev) => ({ ...prev, priority: e.target.value }))} style={{ ...inputStyle, fontSize: 12 }}>
                          <option value="low">low</option>
                          <option value="medium">medium</option>
                          <option value="high">high</option>
                        </select>
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
                            priority: taskEditorDraft.priority || "medium",
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
                            <Avatar initials={msg.from_initials} src={users.find(u => u.id === msg.from_user)?.avatar_url} size={28} dark={dark} />
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
                  <MentionInput dark={dark} value={newMessage} onChange={setNewMessage} onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSendMessage(activeProject.id)} placeholder="message the team... (@mention)" users={users} following={following} followers={followers} style={{ ...inputStyle, fontSize: 12 }} />
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
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnter={() => setFilesDragActive(true)}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) setFilesDragActive(false);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setFilesDragActive(false);
                    const file = e.dataTransfer.files?.[0];
                    if (!file) return;
                    setFileUploadLoading(true);
                    setFileUploadProgress(25);
                    const path = `project-files/${activeProject.id}/${file.name}`;
                    const { error: uploadError } = await supabase.storage.from("user-uploads").upload(path, file, { upsert: true });
                    if (uploadError) {
                      setFileUploadLoading(false);
                      setFileUploadProgress(0);
                      showToast("Upload failed.");
                      return;
                    }
                    setFileUploadProgress(80);
                    const { data: { publicUrl } } = supabase.storage.from("user-uploads").getPublicUrl(path);
                    const { data } = await supabase.from("project_files").insert({
                      project_id: activeProject.id,
                      uploader_id: authUser.id,
                      uploader_name: profile?.name || "Unknown",
                      file_name: file.name,
                      file_url: publicUrl,
                      file_size: file.size,
                      file_type: file.type || "application/octet-stream",
                    }).select().single();
                    if (data) {
                      setProjectFiles((prev) => [data, ...prev.filter((f) => f.id !== data.id)]);
                      showToast("File uploaded.");
                    }
                    setFileUploadProgress(100);
                    setTimeout(() => { setFileUploadLoading(false); setFileUploadProgress(0); }, 240);
                  }}
                  style={{ marginBottom: 20, border: `1px dashed ${filesDragActive ? "#60a5fa" : border}`, borderRadius: 10, background: filesDragActive ? (dark ? "#131b27" : "#f6faff") : bg2, padding: "16px 14px", transition: "all 0.15s ease" }}
                >
                  <div style={{ marginBottom: 10, fontSize: 12, color: textMuted }}>Drag and drop a file here, or choose one manually.</div>
                  <label style={{ display: "inline-block", cursor: "pointer" }}>
                    <div style={{ ...btnP, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12 }}>↑ upload file</div>
                    <input type="file" style={{ display: "none" }} onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setFileUploadLoading(true);
                      setFileUploadProgress(25);
                      const path = `project-files/${activeProject.id}/${file.name}`;
                      const { error: uploadError } = await supabase.storage.from("user-uploads").upload(path, file, { upsert: true });
                      if (uploadError) {
                        setFileUploadLoading(false);
                        setFileUploadProgress(0);
                        showToast("Upload failed.");
                        return;
                      }
                      setFileUploadProgress(80);
                      const { data: { publicUrl } } = supabase.storage.from("user-uploads").getPublicUrl(path);
                      const { data } = await supabase.from("project_files").insert({
                        project_id: activeProject.id,
                        uploader_id: authUser.id,
                        uploader_name: profile?.name || "Unknown",
                        file_name: file.name,
                        file_url: publicUrl,
                        file_size: file.size,
                        file_type: file.type || "application/octet-stream",
                      }).select().single();
                      if (data) {
                        setProjectFiles((prev) => [data, ...prev.filter((f) => f.id !== data.id)]);
                        showToast("File uploaded.");
                      }
                      setFileUploadProgress(100);
                      setTimeout(() => { setFileUploadLoading(false); setFileUploadProgress(0); }, 240);
                    }} />
                  </label>
                  {fileUploadLoading && <div style={{ fontSize: 11, color: textMuted, marginTop: 10 }}>uploading... {fileUploadProgress}%</div>}
                </div>
                {projectFiles.length === 0
                  ? <div style={{ fontSize: 13, color: textMuted }}>no files yet. upload something to share with the team.</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {projectFiles.map((file, i) => (
                        <div key={file.id} style={{ background: bg2, borderRadius: i === 0 && projectFiles.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === projectFiles.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < projectFiles.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 18px" }}>
                          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                            <div style={{ fontSize: 10, flexShrink: 0, fontFamily: "monospace", border: `1px solid ${border}`, borderRadius: 6, padding: "3px 6px", color: textMuted }}>
                              {fileTypeBadge(file.file_type, file.file_name)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: text, marginBottom: 2 }}>{file.file_name}</div>
                              <div style={{ fontSize: 10, color: textMuted }}>{file.uploader_name || "Unknown"} · {new Date(file.created_at).toLocaleDateString()} · {formatFileSize(file.file_size)}</div>
                            </div>
                            <a href={file.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: text, textDecoration: "underline", flexShrink: 0 }}>download</a>
                            {(file.uploader_id === authUser?.id || activeProject.owner_id === authUser?.id) && (
                              <button
                                className="hb"
                                onClick={async () => {
                                  const path = `project-files/${activeProject.id}/${file.file_name}`;
                                  await supabase.storage.from("user-uploads").remove([path]);
                                  await supabase.from("project_files").delete().eq("id", file.id);
                                  setProjectFiles((prev) => prev.filter((f) => f.id !== file.id));
                                  showToast("File deleted.");
                                }}
                                style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", flexShrink: 0 }}
                              >
                                delete
                              </button>
                            )}
                          </div>
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
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px" }}>PROJECT DOC</div>
                  {(activeProject.owner_id === authUser?.id || projectMembers.some((u) => u.id === authUser?.id)) && (
                    <button className="hb" onClick={() => setWorkspaceDocEditing((prev) => !prev)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", color: textMuted, fontFamily: "inherit" }}>
                      {workspaceDocEditing ? "view" : "edit"}
                    </button>
                  )}
                </div>
                {workspaceDocLoading ? (
                  <div style={{ fontSize: 12, color: textMuted }}>loading doc...</div>
                ) : workspaceDocEditing ? (
                  <textarea
                    value={workspaceDocDraft}
                    onChange={(e) => setWorkspaceDocDraft(e.target.value)}
                    onBlur={async () => {
                      const payload = {
                        project_id: activeProject.id,
                        content: workspaceDocDraft,
                        updated_at: new Date().toISOString(),
                        updated_by: authUser.id,
                        updated_by_name: profile?.name || "Unknown",
                      };
                      const { data } = await supabase.from("project_docs").upsert(payload, { onConflict: "project_id" }).select().single();
                      if (data) setWorkspaceDoc(data);
                      showToast("Doc saved.");
                    }}
                    placeholder="Write notes for this project..."
                    style={{ ...inputStyle, resize: "vertical", minHeight: 300, fontSize: 13, lineHeight: 1.7, fontFamily: "inherit" }}
                  />
                ) : (
                  <div style={{ ...inputStyle, minHeight: 220, whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.75 }}>
                    {workspaceDoc?.content ? workspaceDoc.content : <span style={{ color: textMuted }}>No doc yet. Click edit to start writing.</span>}
                  </div>
                )}
                {workspaceDoc?.updated_at && (
                  <div style={{ marginTop: 10, fontSize: 11, color: textMuted }}>
                    Last edited by {workspaceDoc.updated_by_name || "Unknown"} · {relativeTime(workspaceDoc.updated_at)}
                  </div>
                )}
              </div>
            )}

            {/* UPDATES */}
            {projectTab === "updates" && (
              <div>
                <div style={{ display: "flex", gap: 10, marginBottom: 22, alignItems: "flex-start" }}>
                  <Avatar initials={myInitials} src={profile?.avatar_url} size={28} dark={dark} />
                  <div style={{ flex: 1 }}>
                    <MentionInput dark={dark} value={newUpdate} onChange={setNewUpdate} placeholder="post an update... (@mention someone)" users={users} following={following} followers={followers} style={{ ...inputStyle, resize: "none", fontSize: 12, padding: "8px 12px" }} rows={2} />
                    {newUpdate.trim() && (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                        <button className="hb" onClick={async () => {
                          const updateText = newUpdate;
                          await handlePostUpdate(activeProject.id);
                          if (shareUpdateToFeed && updateText.trim()) {
                            const payload = {
                              user_id: authUser.id,
                              user_name: profile.name,
                              user_initials: myInitials,
                              user_role: profile.role || "",
                              content: updateText,
                              project_id: activeProject.id,
                              project_title: activeProject.title,
                            };
                            const { data } = await supabase.from("posts").insert(payload).select().single();
                            if (data) { setPosts(prev => [data, ...prev]); showToast("Shared to your feed."); }
                          }
                          setShareUpdateToFeed(false);
                        }} style={{ ...btnP, padding: "7px 14px", fontSize: 11 }}>post</button>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
                          <input type="checkbox" checked={shareUpdateToFeed} onChange={e => setShareUpdateToFeed(e.target.checked)} style={{ cursor: "pointer" }} />
                          <span style={{ fontSize: 11, color: textMuted }}>also share to feed</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
                {projectUpdates.length === 0 ? <div style={{ fontSize: 12, color: textMuted }}>no updates yet.</div>
                  : projectUpdates.map((u, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, marginBottom: 18 }}>
                      <Avatar initials={u.initials} src={users.find(usr => usr.id === u.user_id)?.avatar_url} size={28} dark={dark} />
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px" }}>TEAM</div>
                  {activeProject.owner_id === authUser?.id && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="hb" onClick={() => setShowInviteUserModal(true)} style={{ ...btnG, padding: "6px 10px", fontSize: 11 }}>Invite someone</button>
                      <button className="hb" onClick={() => openReviewApplicants(activeProject)} style={{ ...btnP, padding: "6px 10px", fontSize: 11 }}>Review applications</button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${border}` }}>
                  <Avatar initials={activeProject.owner_initials} src={users.find(u => u.id === activeProject.owner_id)?.avatar_url} size={36} dark={dark} />
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
                    {a.applicant_id === authUser?.id && activeProject.owner_id !== authUser?.id && (
                      <button className="hb" onClick={() => handleLeaveProject(activeProject.id)}
                        style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 8px", fontSize: 10, cursor: "pointer", color: textMuted, fontFamily: "inherit", marginLeft: 4 }}>
                        Leave project
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
            {projectTab === "plugins" && shouldShowPluginsTab && (
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
        <div className="pad fu" style={{ width: "100%", padding: "28px 32px 48px" }}>
          <button onClick={() => setViewFullProfile(null)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, marginBottom: 28 }}>← back</button>

          {/* Identity — mirrors own profile */}
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 20 }}>PROFILE</div>
          <div className="profile-identity-banner" style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 20 }}>
            <div style={{ flexShrink: 0 }}>
              <div className="profile-identity-row" style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Avatar initials={initials(viewFullProfile.name)} src={viewFullProfile.avatar_url} size={52} dark={dark} />
                  <span style={{ position: "absolute", top: 2, right: 2, width: 8, height: 8, borderRadius: "50%", background: getCapacityStatus(viewFullProfile.id) === "On Project" ? "#f97316" : "#22c55e", border: `1.5px solid ${bg}` }} />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 400, color: text, letterSpacing: "-0.5px" }}>{viewFullProfile.name}</div>
                  {viewFullProfile.username && <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>@{viewFullProfile.username}</div>}
                  <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>{viewFullProfile.role}</div>
                  {viewFullProfile.location && <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>{viewFullProfile.location}</div>}
                  <div style={{ fontSize: 10, color: text, marginTop: 4 }}>
                    <button className="hb" onClick={() => setShowProjectsFor(viewFullProfile.id)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 10, padding: 0 }}>
                      {projects.filter(p => p.owner_id === viewFullProfile.id).length + applications.filter(a => a.applicant_id === viewFullProfile.id && normalizeApplicationStatus(a.status) === "accepted").length} project{(projects.filter(p => p.owner_id === viewFullProfile.id).length + applications.filter(a => a.applicant_id === viewFullProfile.id && normalizeApplicationStatus(a.status) === "accepted").length) !== 1 ? "s" : ""}
                    </button>
                    {" · "}
                    <button className="hb" onClick={() => setShowCollaborators(viewFullProfile.id)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 10, padding: 0 }}>
                      {getCollaborators(viewFullProfile.id).length} collaborator{getCollaborators(viewFullProfile.id).length !== 1 ? "s" : ""}
                    </button>
                  </div>
                  <div style={{ fontSize: 10, marginTop: 2, color: getCapacityStatus(viewFullProfile.id) === "On Project" ? "#f97316" : "#22c55e" }}>{getCapacityStatus(viewFullProfile.id)}</div>
                </div>
              </div>
            </div>
            {viewFullProfile.banner_pixels && (
              <div className="profile-banner-shell" style={{ flex: 1, minWidth: 0, border: `1px solid ${border}`, borderRadius: 8, overflow: "hidden", background: dark ? "#000" : "#fff", minHeight: 110 }}>
                <div className="profile-banner-canvas">
                  <PixelBannerDisplay pixels={(() => { try { return normalizeBannerPixels(JSON.parse(viewFullProfile.banner_pixels)); } catch { return []; } })()} dark={dark} height={110} />
                </div>
              </div>
            )}
          </div>
          {viewFullProfile.bio && <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 20 }}>{viewFullProfile.bio}</p>}
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
        <div className="pad fu" style={{ width: "100%", padding: "28px 32px 48px" }}>
          {!editProfile ? (
            <div>
              {/* Identity + Banner side by side */}
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 20 }}>PROFILE</div>
              <div className="profile-identity-banner" style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 20 }}>
                {/* Left: identity */}
                <div style={{ flexShrink: 0 }}>
                  <div className="profile-identity-row" style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <Avatar initials={myInitials} src={profile?.avatar_url} size={52} dark={dark} />
                      <span style={{ position: "absolute", top: 2, right: 2, width: 8, height: 8, borderRadius: "50%", background: getCapacityStatus(authUser?.id) === "On Project" ? "#f97316" : "#22c55e", border: `1.5px solid ${bg}` }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 400, color: text, letterSpacing: "-0.5px" }}>{profile?.name || "Anonymous"}</div>
                      {profile?.username
                        ? <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>@{profile.username}</div>
                        : <div style={{ fontSize: 11, color: textMuted, marginTop: 1, cursor: "pointer", textDecoration: "underline" }} onClick={() => setEditProfile(true)}>set a username →</div>
                      }
                      <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>{profile?.role}</div>
                      {profile?.location && <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>{profile.location}</div>}
                      <div style={{ fontSize: 10, color: text, marginTop: 4 }}>
                        <button className="hb" onClick={() => setShowProjectsFor(authUser?.id)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 10, padding: 0 }}>
                          {myProjects.length} project{myProjects.length !== 1 ? "s" : ""}
                        </button>
                        {" · "}
                        <button className="hb" onClick={() => setShowCollaboratorsList(true)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 10, padding: 0 }}>
                          {myCollaborators.length} collaborator{myCollaborators.length !== 1 ? "s" : ""}
                        </button>
                      </div>
                      <div style={{ fontSize: 10, color: text, marginTop: 2 }}>
                        <button className="hb" onClick={() => setShowFollowList("followers")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 10, padding: 0 }}>
                          {followers.length} follower{followers.length !== 1 ? "s" : ""}
                        </button>
                        {" · "}
                        <button className="hb" onClick={() => setShowFollowList("following")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 10, padding: 0 }}>
                          {following.length} following
                        </button>
                      </div>
                      <div style={{ fontSize: 10, marginTop: 2, color: getCapacityStatus(authUser?.id) === "On Project" ? "#f97316" : "#22c55e" }}>{getCapacityStatus(authUser?.id)}</div>
                      {profile?.username && (
                        <div style={{ marginTop: 8 }}>
                          <button className="hb" onClick={() => {
                            navigator.clipboard.writeText(`https://collaborativelaboratories.com/u/${profile.username}`).then(() => {
                              setProfileLinkCopied(true);
                              setTimeout(() => setProfileLinkCopied(false), 2000);
                            }).catch(() => {});
                          }} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "3px 8px", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 10 }}>
                            copy profile link
                          </button>
                          {profileLinkCopied && <span style={{ marginLeft: 8, fontSize: 10, color: textMuted }}>copied!</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {/* Right: pixel banner */}
                <div className="profile-banner-shell" style={{ flex: 1, minWidth: 0 }}>
                  <div className="profile-banner-card" style={{ position: "relative", border: `1px solid ${border}`, borderRadius: 8, overflow: "hidden", background: dark ? "#000" : "#fff", minHeight: 110, cursor: "pointer" }} onClick={() => setShowBannerEditor(true)}>
                    {bannerPixels.some(v => v) ? (
                      <div className="profile-banner-canvas"><PixelBannerDisplay pixels={bannerPixels} dark={dark} height={110} /></div>
                    ) : (
                      <div className="profile-banner-canvas" style={{ height: 110, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 11, color: textMuted }}>+ design your banner</span>
                      </div>
                    )}
                    <div style={{ position: "absolute", bottom: 4, right: 6, fontSize: 9, color: textMuted, opacity: 0.6 }}>edit</div>
                  </div>
                </div>
              </div>
              {profile?.bio && <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 20 }}>{profile.bio}</p>}
              {hasNoProfileActivity && (
                <div style={{ marginBottom: 28, padding: "16px 18px", border: `1px solid ${border}`, borderRadius: 10, background: bg2 }}>
                  <div style={{ fontSize: 13, color: text, marginBottom: 12 }}>You haven’t built anything yet — start your first project or share what you're working on</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="hb" onClick={openCreateProjectFlow} style={btnP}>Post a project</button>
                    <button className="hb" onClick={() => { setAppScreen("network"); setNetworkTab("feed"); }} style={btnG}>Share an update</button>
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
                <div style={{ ...labelStyle, marginBottom: 8 }}>SKILLS</div>
                {(profile?.skills || []).length === 0
                  ? <div style={{ fontSize: 12, color: textMuted }}>no skills. <button onClick={() => setEditProfile(true)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>add →</button></div>
                  : <div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>{(profile?.skills || []).map(s => <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}</div>
                      <div style={{ fontSize: 11, color: textMuted }}>★ {forYou.length} matching project{forYou.length !== 1 ? "s" : ""} <button className="hb" onClick={() => { setAppScreen("explore"); setExploreTab("projects"); setProjectsSubTab("for-you"); }} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline", marginLeft: 4 }}>view →</button></div>
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
                            <span style={{ fontSize: 10, color: normalizeApplicationStatus(a.status) === "accepted" ? text : textMuted, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>{normalizeApplicationStatus(a.status)}</span>
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

              {/* Avatar upload */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Avatar initials={myInitials} src={profile?.avatar_url} size={64} dark={dark} />
                  <label style={{ position: "absolute", inset: 0, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", opacity: 0, transition: "opacity 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "0"}>
                    <span style={{ fontSize: 10, color: "#fff", fontFamily: "inherit", letterSpacing: "0.5px" }}>change</span>
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={async e => {
                      const file = e.target.files[0];
                      if (!file) return;
                      showToast("Uploading...");
                      const ext = file.name.split(".").pop();
                      const path = `avatars/${authUser.id}/avatar.${ext}`;
                      const { error } = await supabase.storage.from("user-uploads").upload(path, file, { upsert: true });
                      if (error) { showToast("Upload failed."); return; }
                      const { data: urlData } = supabase.storage.from("user-uploads").getPublicUrl(path);
                      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
                      setProfile(prev => ({ ...prev, avatar_url: avatarUrl }));
                      await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", authUser.id);
                      showToast("Photo updated.");
                    }} />
                  </label>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: text, fontWeight: 500, marginBottom: 4 }}>{profile?.name || "Your Name"}</div>
                  <div style={{ fontSize: 11, color: textMuted }}>hover photo to change</div>
                </div>
              </div>

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
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                    {/* Canonical skills */}
                    {SKILLS.map(s => { const sel = (profile?.skills || []).includes(s); return <button key={s} className="hb" onClick={() => setProfile({ ...profile, skills: sel ? profile.skills.filter(x => x !== s) : [...(profile?.skills || []), s] })} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                    {/* Custom skills not in canonical list */}
                    {(profile?.skills || []).filter(s => !SKILLS.includes(s)).map(s => (
                      <button key={s} className="hb" onClick={() => setProfile({ ...profile, skills: profile.skills.filter(x => x !== s) })}
                        style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: text, color: bg, border: `1px solid ${text}` }}>
                        {s} ✕
                      </button>
                    ))}
                  </div>
                  {/* Add custom skill */}
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={customSkillInput}
                      onChange={e => setCustomSkillInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addCustomSkill(profile?.skills || [], (newSkills) => setProfile({ ...profile, skills: newSkills }))}
                      placeholder="add a skill not listed above..."
                      style={{ ...inputStyle, flex: 1, fontSize: 11, padding: "7px 12px" }}
                    />
                    <button className="hb" onClick={() => addCustomSkill(profile?.skills || [], (newSkills) => setProfile({ ...profile, skills: newSkills }))}
                      style={{ ...btnG, fontSize: 11, padding: "7px 14px", whiteSpace: "nowrap" }}>+ add</button>
                  </div>
                  <div style={{ fontSize: 10, color: textMuted, marginTop: 5 }}>Only real professional skills — inappropriate entries are blocked.</div>
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
              <div>
                <label style={labelStyle}>COVER IMAGE (optional)</label>
                <input type="file" accept="image/*" onChange={(e) => setNewProject({ ...newProject, coverImageFile: e.target.files?.[0] || null })} style={{ ...inputStyle, padding: "8px 10px" }} />
              </div>
              <div><label style={labelStyle}>TITLE</label><input style={inputStyle} placeholder="Project name" value={newProject.title} onChange={e => { setCreateProjectError(""); setNewProject({ ...newProject, title: e.target.value }); }} /></div>
              <div><label style={labelStyle}>DESCRIPTION</label><textarea style={{ ...inputStyle, resize: "none" }} rows={4} placeholder="What are you building? What do you need?" value={newProject.description} onChange={e => { setCreateProjectError(""); setNewProject({ ...newProject, description: e.target.value }); }} /></div>
              <div><label style={labelStyle}>CATEGORY</label><select style={inputStyle} value={newProject.category} onChange={e => setNewProject({ ...newProject, category: e.target.value })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
              <div>
                <label style={labelStyle}>SKILLS NEEDED</label>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {SKILLS.map(s => { const sel = newProject.skills.includes(s); return <button key={s} className="hb" onClick={() => setNewProject({ ...newProject, skills: sel ? newProject.skills.filter(x => x !== s) : [...newProject.skills, s] })} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                </div>
              </div>
              <div><label style={labelStyle}>OPEN ROLES</label><input style={inputStyle} placeholder="Designer, Backend Dev, Marketing" value={(newProject.openRoles || []).join(", ")} onChange={e => setNewProject({ ...newProject, openRoles: e.target.value.split(",").map((role) => role.trim()).filter(Boolean) })} /></div>
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
              <button className="hb" onClick={() => { if (isCreatingProject) return; setShowCreate(false); setCreateProjectError(""); setNewProject({ title: "", description: "", category: CATEGORIES[0], skills: [], openRoles: [], maxCollaborators: 2, location: "", goals: "", timeline: "", is_private: false, coverImageFile: null }); }} style={btnG}>cancel</button>
              <button className="hb" onClick={handlePostProject} disabled={isCreatingProject} style={{ ...btnP, flex: 1, opacity: isCreatingProject ? 0.7 : 1, cursor: isCreatingProject ? "wait" : "pointer" }}>{isCreatingProject ? "posting..." : "post →"}</button>
            </div>
          </div>
        </div>
      )}

      {showInviteUserModal && activeProject && (
        <div onClick={() => { setShowInviteUserModal(false); setInviteTargetUser(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 240, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, width: "100%", maxWidth: 520, padding: 18 }}>
            <div style={{ fontSize: 11, color: text, marginBottom: 10 }}>Invite someone</div>
            {!inviteTargetUser ? (
              <>
                <input value={inviteSearch} onChange={(e) => setInviteSearch(e.target.value)} placeholder="Search by name or username" style={{ ...inputStyle, marginBottom: 10 }} />
                <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${border}`, borderRadius: 8 }}>
                  {filteredInviteUsers.map((u) => (
                    <button key={u.id} className="hb" onClick={() => setInviteTargetUser(u)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${border}`, padding: "9px 10px", color: text, fontFamily: "inherit", display: "flex", justifyContent: "space-between" }}>
                      <span>{u.name}</span><span style={{ color: textMuted, fontSize: 11 }}>@{u.username || "user"}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div>
                <div style={{ fontSize: 12, color: text, marginBottom: 12 }}>Invite {inviteTargetUser.name} to {activeProject.title}?</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="hb" onClick={() => setInviteTargetUser(null)} style={{ ...btnG, flex: 1, padding: "8px 12px" }}>cancel</button>
                  <button className="hb" onClick={confirmDirectInvite} style={{ ...btnP, flex: 1, padding: "8px 12px" }}>send invite</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {reportModal && (
        <div onClick={() => setReportModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 245, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, width: "100%", maxWidth: 420, padding: 18 }}>
            <div style={{ fontSize: 12, color: text, marginBottom: 12 }}>Report {reportModal.label}</div>
            <select value={reportReason} onChange={(e) => setReportReason(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }}>
              {["Spam", "Harassment", "Misinformation", "Inappropriate content", "Other"].map((reason) => <option key={reason}>{reason}</option>)}
            </select>
            <textarea value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} rows={3} placeholder="Details (optional)" style={{ ...inputStyle, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="hb" onClick={() => setReportModal(null)} style={{ ...btnG, flex: 1, padding: "8px 12px" }}>cancel</button>
              <button className="hb" onClick={submitReport} style={{ ...btnP, flex: 1, padding: "8px 12px" }}>submit report</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: text, color: bg, padding: "11px 20px", borderRadius: 8, fontSize: 11, zIndex: 300, animation: "tin 0.3s ease", whiteSpace: "nowrap" }}>{toast}</div>}

      {showTeamReview && (
        <TeamReviewModal
          project={showTeamReview}
          authUser={authUser}
          applications={applications}
          users={users}
          teamReviews={teamReviews}
          dark={dark} bg={bg} bg2={bg2} border={border} text={text} textMuted={textMuted} btnP={btnP} btnG={btnG}
          onClose={() => setShowTeamReview(null)}
          onSubmit={async (reviews) => {
            const { data } = await supabase.from("team_reviews").upsert(reviews, { onConflict: "project_id,reviewer_id,reviewee_id" }).select();
            if (data) setTeamReviews(prev => {
              const existing = prev.filter(r => !(r.project_id === showTeamReview.id && r.reviewer_id === authUser.id));
              return [...existing, ...data];
            });
          }}
        />
      )}

      {/* Create Community Thread modal */}
      {showCreatePost && activeCommunity && (
        <div onClick={() => setShowCreatePost(false)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.92)" : "rgba(200,200,200,0.88)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(12px)", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "28px", width: "100%", maxWidth: 520 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px" }}>NEW THREAD · {COMMUNITY_SYMBOLS[activeCommunity.slug] || activeCommunity.emoji} {activeCommunity.name.toUpperCase()}</div>
              <button onClick={() => setShowCreatePost(false)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>✕</button>
            </div>
            <input value={newThreadTitle} onChange={e => setNewThreadTitle(e.target.value)}
              placeholder="Thread title"
              style={{ ...inputStyle, fontSize: 16, fontWeight: 400, letterSpacing: "-0.3px", marginBottom: 12, padding: "10px 14px" }}
            />
            <textarea value={newThreadContent} onChange={e => setNewThreadContent(e.target.value)}
              placeholder="What do you want to discuss? (optional)"
              style={{ ...inputStyle, resize: "none", minHeight: 100, fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="hb" onClick={() => setShowCreatePost(false)} style={{ ...btnG, flex: 1 }}>cancel</button>
              <button className="hb" onClick={async () => {
                if (!newThreadTitle.trim()) return;
                const payload = {
                  community_id: activeCommunity.id, user_id: authUser.id, user_name: profile.name,
                  user_initials: myInitials, title: newThreadTitle.trim(),
                  content: newThreadContent.trim() || null, upvotes: 0, comment_count: 0,
                };
                const { data, error } = await supabase.from("community_posts").insert(payload).select().single();
                if (!error && data) {
                  setCommunityPosts(prev => [data, ...prev]);
                  setNewThreadTitle(""); setNewThreadContent(""); setShowCreatePost(false);
                  showToast("Thread posted.");
                }
              }} style={{ ...btnP, flex: 2 }} disabled={!newThreadTitle.trim()}>post thread →</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Community modal */}
      {showCreateCommunity && (
        <div onClick={() => setShowCreateCommunity(false)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.92)" : "rgba(200,200,200,0.88)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(12px)", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "28px", width: "100%", maxWidth: 440 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px" }}>CREATE COMMUNITY</div>
              <button onClick={() => setShowCreateCommunity(false)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <input value={newCommunityEmoji} onChange={e => setNewCommunityEmoji(e.target.value)}
                placeholder="◈" title="Symbol (e.g. ♪ ◈ ↗ ▶ ⊕)"
                style={{ ...inputStyle, width: 48, textAlign: "center", fontSize: 16, padding: "8px", flexShrink: 0 }} maxLength={2} />
              <input value={newCommunityName} onChange={e => setNewCommunityName(e.target.value)}
                placeholder="Community name"
                style={{ ...inputStyle, flex: 1, fontSize: 14, padding: "8px 12px" }} />
            </div>
            <textarea value={newCommunityDesc} onChange={e => setNewCommunityDesc(e.target.value)}
              placeholder="What is this community about? (optional)"
              style={{ ...inputStyle, resize: "none", minHeight: 80, fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="hb" onClick={() => setShowCreateCommunity(false)} style={{ ...btnG, flex: 1 }}>cancel</button>
              <button className="hb" onClick={async () => {
                if (!newCommunityName.trim()) return;
                const slug = await resolveCommunitySlug(newCommunityName);
                const payload = { name: newCommunityName.trim(), slug, description: newCommunityDesc.trim() || null, emoji: newCommunityEmoji || "◈", created_by: authUser.id };
                const { data, error } = await supabase.from("communities").insert(payload).select().single();
                if (error) { showToast("Name taken or invalid. Try another."); return; }
                if (data) {
                  setCommunities(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
                  await supabase.from("community_members").insert({ community_id: data.id, user_id: authUser.id, role: "admin" });
                  setJoinedCommunityIds(prev => [...prev, data.id]);
                  setNewCommunityName(""); setNewCommunityDesc(""); setNewCommunityEmoji("◈");
                  setShowCreateCommunity(false);
                  setAppScreen("communities");
                  showToast("Community created!");
                }
              }} style={{ ...btnP, flex: 2 }} disabled={!newCommunityName.trim()}>create →</button>
            </div>
          </div>
        </div>
      )}

      {/* Deploy explainer (step 1) */}
      {showDeployExplainer && (
        <div onClick={() => setShowDeployExplainer(false)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.92)" : "rgba(200,200,200,0.88)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(12px)", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "32px", width: "100%", maxWidth: 420 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 16 }}>DEPLOY</div>
            <div style={{ fontSize: 22, fontWeight: 400, letterSpacing: "-1px", color: text, marginBottom: 16, lineHeight: 1.3 }}>Ready to go live?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>✓</span>
                <div>
                  <div style={{ fontSize: 13, color: text, marginBottom: 2 }}>Marks the project as complete</div>
                  <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.5 }}>No more tasks will be added. The project status locks in as deployed.</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>✦</span>
                <div>
                  <div style={{ fontSize: 13, color: text, marginBottom: 2 }}>Shares a post with your network</div>
                  <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.5 }}>You'll write a short note about what you built — visible to everyone on CoLab.</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>★</span>
                <div>
                  <div style={{ fontSize: 13, color: text, marginBottom: 2 }}>Unlocks team reviews</div>
                  <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.5 }}>Your collaborators will be prompted to rate each other. Ratings build your reputation on CoLab.</div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="hb" onClick={() => setShowDeployExplainer(false)} style={{ ...btnG, flex: 1 }}>cancel</button>
              <button className="hb" onClick={() => { setShowDeployExplainer(false); setShowShipModal(true); }} style={{ ...btnP, flex: 2 }}>continue →</button>
            </div>
          </div>
        </div>
      )}

      {/* Deploy post modal (step 2) */}
      {showShipModal && (
        <div onClick={() => setShowShipModal(false)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.92)" : "rgba(200,200,200,0.88)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(12px)", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "28px", width: "100%", maxWidth: 460 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 8 }}>DEPLOY</div>
            {(() => {
              const openCount = tasks.filter(t => t.project_id === activeProject?.id && !t.done).length;
              return openCount === 0
                ? <div style={{ fontSize: 18, fontWeight: 400, letterSpacing: "-0.5px", color: text, marginBottom: 6 }}>All tasks complete.</div>
                : <div style={{ fontSize: 18, fontWeight: 400, letterSpacing: "-0.5px", color: text, marginBottom: 6 }}>{openCount} task{openCount !== 1 ? "s" : ""} still open.</div>;
            })()}
            <div style={{ fontSize: 12, color: textMuted, marginBottom: 20 }}>Write a note about what you built — it'll be shared with your network.</div>
            <textarea
              value={shipPostContent}
              onChange={e => setShipPostContent(e.target.value)}
              placeholder="What did you build? Who did you build it with?"
              style={{ ...inputStyle, resize: "none", minHeight: 100, fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="hb" onClick={() => setShowShipModal(false)} style={{ ...btnG, flex: 1 }}>back</button>
              <button className="hb" onClick={async () => {
                const proj = activeProject;
                await handleShipProject(proj?.id, shipPostContent);
                const hasTeammates = applications.some(a => a.project_id === proj?.id && normalizeApplicationStatus(a.status) === "accepted") || proj?.owner_id !== authUser?.id;
                if (hasTeammates) setTimeout(() => setShowTeamReview(proj), 400);
              }} style={{ ...btnP, flex: 2 }}>deploy →</button>
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
                <div style={{ fontSize: 11, color: textMuted, letterSpacing: "1px", marginBottom: 10 }}>APPEARANCE</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="hb" onClick={() => setDark(false)}
                    style={{ flex: 1, padding: "10px", borderRadius: 8, fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                      background: !dark ? (dark ? "#fff" : "#000") : "none",
                      color: !dark ? (dark ? "#000" : "#fff") : textMuted,
                      border: `1px solid ${!dark ? (dark ? "#fff" : "#000") : border}` }}>
                    light
                  </button>
                  <button className="hb" onClick={() => setDark(true)}
                    style={{ flex: 1, padding: "10px", borderRadius: 8, fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                      background: dark ? "#fff" : "none",
                      color: dark ? "#000" : textMuted,
                      border: `1px solid ${dark ? "#fff" : border}` }}>
                    dark
                  </button>
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${border}`, paddingTop: 20 }}>
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
