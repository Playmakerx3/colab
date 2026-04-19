import { ACTIVATION_EVENTS } from "../constants/activationEvents";
import { supabase } from "../supabase";

export const ACTIVATION_DASHBOARD_ENABLED = import.meta.env.VITE_ACTIVATION_DASHBOARD_ENABLED === "true";
export const ACTIVATION_QA_ENABLED = import.meta.env.VITE_ACTIVATION_QA_ENABLED !== "false";

export const ACTIVATION_COHORT_WINDOWS = Object.freeze({
  "24h": { label: "Last 24h", hours: 24 },
  "7d": { label: "Last 7d", hours: 24 * 7 },
  "30d": { label: "Last 30d", hours: 24 * 30 },
});

const ACTIVATION_STAGE_DEFS = Object.freeze([
  { stageOrder: 1, eventName: ACTIVATION_EVENTS.SIGNUP_STARTED, stageLabel: "Signup started" },
  { stageOrder: 2, eventName: ACTIVATION_EVENTS.SIGNUP_COMPLETED, stageLabel: "Signup completed" },
  { stageOrder: 3, eventName: ACTIVATION_EVENTS.PROJECT_CREATED, stageLabel: "Project created" },
  { stageOrder: 4, eventName: ACTIVATION_EVENTS.FIRST_COLLAB_INVITE_SENT, stageLabel: "First collab invite sent" },
  { stageOrder: 5, eventName: ACTIVATION_EVENTS.FIRST_COLLAB_INVITE_ACCEPTED, stageLabel: "First collab invite accepted" },
  { stageOrder: 6, eventName: ACTIVATION_EVENTS.FIRST_SHARED_OUTPUT, stageLabel: "First shared output" },
]);

const roundPct = (value) => {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
};

export const listActivationStages = () => ACTIVATION_STAGE_DEFS;

export const fetchActivationFunnelWindow = async (windowKey = "7d") => {
  const windowConfig = ACTIVATION_COHORT_WINDOWS[windowKey] || ACTIVATION_COHORT_WINDOWS["7d"];
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowConfig.hours * 60 * 60 * 1000).toISOString();
  const windowEnd = now.toISOString();

  const { data, error } = await supabase
    .from("activation_events")
    .select("event_name")
    .gte("created_at", windowStart)
    .lt("created_at", windowEnd);

  if (error) throw error;

  const countByEvent = new Map();
  for (const row of data || []) {
    const eventName = row.event_name;
    countByEvent.set(eventName, (countByEvent.get(eventName) || 0) + 1);
  }

  const signupStartedCount = Math.max(countByEvent.get(ACTIVATION_EVENTS.SIGNUP_STARTED) || 0, 1);
  let previousCount = null;

  const stages = ACTIVATION_STAGE_DEFS.map((stage) => {
    const stageCount = countByEvent.get(stage.eventName) || 0;
    const conversionFromSignupStartedPct = roundPct((stageCount / signupStartedCount) * 100);
    const stepToStepConversionPct = previousCount === null || previousCount === 0
      ? null
      : roundPct((stageCount / previousCount) * 100);
    previousCount = stageCount;
    return {
      ...stage,
      stageCount,
      conversionFromSignupStartedPct,
      stepToStepConversionPct,
    };
  });

  return {
    windowKey,
    windowStart,
    windowEnd,
    stages,
  };
};

export const fetchLatestActivationQaResults = async (limit = 7) => {
  const { data, error } = await supabase
    .from("activation_daily_qa_latest_v1")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
};

export const runActivationQa = async ({ forceFailure = false } = {}) => {
  const { data, error } = await supabase.rpc("run_activation_daily_qa_v1", {
    p_qa_date: new Date().toISOString().slice(0, 10),
    p_force_failure: forceFailure,
  });

  if (error) throw error;
  return data;
};
