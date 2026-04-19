import React, { useEffect, useMemo, useState } from "react";
import {
  ACTIVATION_COHORT_WINDOWS,
  ACTIVATION_QA_ENABLED,
  fetchActivationFunnelWindow,
  fetchLatestActivationQaResults,
  runActivationQa,
} from "../../../services/activationDashboardService";

const qaStatusColor = (status) => {
  if (status === "pass") return "#22c55e";
  if (status === "fail") return "#ef4444";
  return "#a1a1aa";
};

const formatDateTime = (value) => {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return date.toLocaleString();
};

export default function ActivationDashboardPanel({
  dark,
  bg2,
  border,
  text,
  textMuted,
  btnP,
  btnG,
}) {
  const [windowKey, setWindowKey] = useState("7d");
  const [funnel, setFunnel] = useState(null);
  const [qaRows, setQaRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningQa, setRunningQa] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = async (selectedWindow = windowKey) => {
    setLoading(true);
    setError("");
    try {
      const [funnelData, qaData] = await Promise.all([
        fetchActivationFunnelWindow(selectedWindow),
        fetchLatestActivationQaResults(10),
      ]);
      setFunnel(funnelData);
      setQaRows(qaData);
    } catch (err) {
      setError(err?.message || "Failed to load activation dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard(windowKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey]);

  const latestQa = qaRows[0] || null;
  const latestFailures = useMemo(() => {
    if (!latestQa?.failure_reasons) return [];
    if (Array.isArray(latestQa.failure_reasons)) return latestQa.failure_reasons;
    return [];
  }, [latestQa]);

  const handleRunQa = async (forceFailure = false) => {
    if (!ACTIVATION_QA_ENABLED) return;
    setRunningQa(true);
    setError("");
    try {
      await runActivationQa({ forceFailure });
      await loadDashboard(windowKey);
    } catch (err) {
      setError(err?.message || "QA run failed.");
    } finally {
      setRunningQa(false);
    }
  };

  return (
    <div className="pad fu" style={{ width: "100%", maxWidth: 920, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 8 }}>FOUNDER ACTIVATION DASHBOARD</div>
          <h2 style={{ fontSize: "clamp(20px, 4vw, 26px)", fontWeight: 400, letterSpacing: "-1.2px", color: text }}>Activation funnel + daily instrumentation QA</h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {Object.entries(ACTIVATION_COHORT_WINDOWS).map(([key, cfg]) => (
            <button
              key={key}
              className="hb"
              onClick={() => setWindowKey(key)}
              style={{
                ...(windowKey === key ? btnP : btnG),
                padding: "6px 10px",
                fontSize: 11,
              }}
            >
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, fontSize: 12, color: "#ef4444", border: "1px solid #ef444466", borderRadius: 8, padding: "10px 12px", background: dark ? "#2a0f12" : "#fff3f3" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: textMuted }}>loading activation metrics...</div>
      ) : (
        <>
          <div style={{ marginBottom: 22, fontSize: 11, color: textMuted }}>
            Cohort window: {formatDateTime(funnel?.windowStart)} to {formatDateTime(funnel?.windowEnd)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 1fr", border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", padding: "10px 12px", background: bg2, borderRight: `1px solid ${border}` }}>STAGE</div>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", padding: "10px 12px", background: bg2, borderRight: `1px solid ${border}` }}>COUNT / BASELINE</div>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", padding: "10px 12px", background: bg2 }}>STEP CONVERSION</div>

            {(funnel?.stages || []).map((stage, index) => (
              <React.Fragment key={stage.eventName}>
                <div style={{ borderTop: `1px solid ${border}`, borderRight: `1px solid ${border}`, padding: "12px" }}>
                  <div style={{ fontSize: 12, color: text }}>{stage.stageLabel}</div>
                  <div style={{ fontSize: 10, color: textMuted }}>{stage.eventName}</div>
                </div>
                <div style={{ borderTop: `1px solid ${border}`, borderRight: `1px solid ${border}`, padding: "12px" }}>
                  <div style={{ fontSize: 14, color: text }}>{stage.stageCount}</div>
                  <div style={{ fontSize: 10, color: textMuted }}>
                    {stage.conversionFromSignupStartedPct != null ? `${stage.conversionFromSignupStartedPct}% from signup_started` : "n/a"}
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${border}`, padding: "12px" }}>
                  <div style={{ fontSize: 14, color: text }}>
                    {index === 0 ? "n/a" : (stage.stepToStepConversionPct != null ? `${stage.stepToStepConversionPct}%` : "n/a")}
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>

          <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px" }}>DAILY QA STATUS</div>
            {ACTIVATION_QA_ENABLED && (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="hb" onClick={() => void handleRunQa(false)} disabled={runningQa} style={{ ...btnG, padding: "6px 10px", fontSize: 11 }}>
                  {runningQa ? "running..." : "run QA now"}
                </button>
                <button className="hb" onClick={() => void handleRunQa(true)} disabled={runningQa} style={{ ...btnP, padding: "6px 10px", fontSize: 11 }}>
                  run negative-path test
                </button>
              </div>
            )}
          </div>

          <div style={{ border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden", marginBottom: 18 }}>
            {latestQa ? (
              <div style={{ padding: "12px 14px", background: bg2 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: text }}>Latest run: {formatDateTime(latestQa.created_at)}</span>
                  <span style={{ fontSize: 10, border: `1px solid ${qaStatusColor(latestQa.status)}66`, color: qaStatusColor(latestQa.status), borderRadius: 999, padding: "2px 8px" }}>
                    {latestQa.status}
                  </span>
                  <span style={{ fontSize: 10, color: textMuted }}>
                    alert stub: {latestQa.alert_stub_triggered ? "triggered" : "not triggered"}
                  </span>
                </div>
                {latestFailures.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {latestFailures.map((failure, idx) => (
                      <div key={`${failure.check || "failure"}-${idx}`} style={{ fontSize: 11, color: textMuted, lineHeight: 1.5 }}>
                        <span style={{ color: text }}>{failure.check || "check"}:</span> {failure.message || "QA failure"}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: textMuted }}>All QA checks passed in the latest run.</div>
                )}
              </div>
            ) : (
              <div style={{ padding: "14px", fontSize: 11, color: textMuted }}>No QA runs found yet.</div>
            )}
          </div>

          <div style={{ border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${border}`, background: bg2, fontSize: 10, color: textMuted, letterSpacing: "1px" }}>RECENT QA RUNS</div>
            {qaRows.length === 0 ? (
              <div style={{ padding: "12px", fontSize: 11, color: textMuted }}>No persisted QA artifacts available yet.</div>
            ) : (
              qaRows.map((row, idx) => (
                <div key={row.id} style={{ padding: "10px 12px", borderTop: idx === 0 ? "none" : `1px solid ${border}`, display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 11, color: text }}>{formatDateTime(row.created_at)}</div>
                  <div style={{ fontSize: 10, color: textMuted }}>qa_date: {row.qa_date}</div>
                  <div style={{ fontSize: 10, color: qaStatusColor(row.status), border: `1px solid ${qaStatusColor(row.status)}66`, borderRadius: 999, padding: "2px 8px" }}>
                    {row.status}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
