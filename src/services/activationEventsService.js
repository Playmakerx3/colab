import { ACTIVATION_EVENTS } from "../constants/activationEvents";
import { supabase } from "../supabase";

const ACTIVATION_INSTRUMENTATION_ENABLED = import.meta.env.VITE_ACTIVATION_INSTRUMENTATION_ENABLED !== "false";
const SESSION_STORAGE_KEY = "colab.activation.session_id";

const getActivationSessionId = () => {
  if (typeof window === "undefined") return "server-session";
  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const generated = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(SESSION_STORAGE_KEY, generated);
  return generated;
};

const emitActivationEvent = async (eventName, { userId = null, projectId = null, context = {}, source = "web" } = {}) => {
  if (!ACTIVATION_INSTRUMENTATION_ENABLED) return { ok: true, skipped: true };

  const payload = {
    p_event_name: eventName,
    p_user_id: userId,
    p_project_id: projectId,
    p_session_id: getActivationSessionId(),
    p_source: source,
    p_context: context,
  };

  const { data, error } = await supabase.rpc("log_activation_event_v1", payload);
  if (error) {
    console.warn("[activation-events] rejected", { eventName, error });
    return { ok: false, error };
  }
  return { ok: true, id: data || null };
};

export const trackSignupStarted = (context = {}) =>
  emitActivationEvent(ACTIVATION_EVENTS.SIGNUP_STARTED, { context, source: "auth.signup" });

export const trackSignupCompleted = ({ userId, context = {} } = {}) =>
  emitActivationEvent(ACTIVATION_EVENTS.SIGNUP_COMPLETED, { userId, context, source: "auth.signup" });

export const trackProjectCreated = ({ userId, projectId, context = {} } = {}) =>
  emitActivationEvent(ACTIVATION_EVENTS.PROJECT_CREATED, { userId, projectId, context, source: "projects.create" });

export const trackFirstCollabInviteSent = ({ userId, projectId, context = {} } = {}) =>
  emitActivationEvent(ACTIVATION_EVENTS.FIRST_COLLAB_INVITE_SENT, { userId, projectId, context, source: "projects.invite" });

export const trackFirstCollabInviteAccepted = ({ userId, projectId, context = {} } = {}) =>
  emitActivationEvent(ACTIVATION_EVENTS.FIRST_COLLAB_INVITE_ACCEPTED, { userId, projectId, context, source: "projects.invite.accept" });

export const trackFirstSharedOutput = ({ userId, projectId, context = {} } = {}) =>
  emitActivationEvent(ACTIVATION_EVENTS.FIRST_SHARED_OUTPUT, { userId, projectId, context, source: "projects.ship" });

