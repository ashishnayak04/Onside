"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ConfigEntry {
  key: string;
  value: string;
  description: string | null;
}

interface PipelineRun {
  status: string | null;
  model_version: string | null;
  fixtures_processed: number | null;
  predictions_written: number | null;
  track_record_synced: number | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

function InfoRow({
  label,
  value,
  masked = false,
  mono = true,
}: {
  label: string;
  value: string;
  masked?: boolean;
  mono?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="flex items-center justify-between py-3 border-b border-chalk/10">
      <span className="text-sm text-stale">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className="text-sm"
          style={{
            color: masked && !revealed ? "var(--stale)" : "var(--chalk)",
            fontFamily: mono ? "monospace" : "inherit",
          }}
        >
          {masked && !revealed ? "••••••••" : value || "Not set"}
        </span>
        {masked && (
          <button
            onClick={() => setRevealed(!revealed)}
            className="text-xs px-2 py-0.5 rounded border border-chalk/10 text-stale hover:text-chalk"
            style={{ background: "var(--ink)" }}
          >
            {revealed ? "Hide" : "Show"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const [configs, setConfigs] = useState<ConfigEntry[]>([]);
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [configRes, statusRes] = await Promise.all([
          fetch("/api/admin/config"),
          fetch("/api/admin/pipeline-status"),
        ]);
        const configData = await configRes.json();
        setConfigs(configData.configs || []);
        const statusData = await statusRes.json();
        setRun(statusData.latestRun || null);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const get = (key: string) => configs.find((c) => c.key === key);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="flex items-center gap-3">
          <svg className="animate-spin w-5 h-5 text-leaf" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-stale">Loading pipeline info...</p>
        </div>
      </div>
    );
  }

  const modelConfig = get("prediction_model");
  const scheduleConfig = get("pipeline_schedule_cron");
  const apiConfig = get("api_football_key");
  const competitionsConfig = get("active_competitions");

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="page-header mb-1">
          Pipeline<span className="text-ember">.</span>
        </h1>
        <p className="text-sm text-stale">
          Prediction pipeline status and model settings
        </p>
      </div>

      {/* Honest status banner */}
      {(() => {
        const s = run?.status;
        const isGreen = s === "success";
        const isRed = s === "failed";
        const color = isRed ? "#D93036" : isGreen ? "#14A05F" : "#F2B01C";
        return (
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3 mb-6"
            style={{
              background: `rgba(${isRed ? "217,48,54" : isGreen ? "20,160,95" : "242,176,28"},0.08)`,
              border: `1px solid rgba(${isRed ? "217,48,54" : isGreen ? "20,160,95" : "242,176,28"},0.25)`,
            }}
          >
            <span className="relative flex w-2 h-2">
              {isRed ? null : (
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ background: color }}
                />
              )}
              <span className="relative inline-flex rounded-full w-2 h-2" style={{ background: color }} />
            </span>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--chalk)" }}>
                {s === "success" && "Last pipeline run succeeded"}
                {s === "failed" && "Last pipeline run failed"}
                {s === "running" && "Pipeline run in progress"}
                {!s && "No pipeline run recorded yet"}
                {run?.finished_at
                  ? ` · ${new Date(run.finished_at).toLocaleString()}`
                  : run?.started_at
                    ? ` · started ${new Date(run.started_at).toLocaleString()}`
                    : ""}
              </p>
              {s === "failed" && run?.error && (
                <p className="mt-0.5 text-xs text-stale">Error: {run.error}</p>
              )}
              {!s && (
                <p className="mt-0.5 text-xs text-stale">
                  This reflects the actual run log — nothing is reported as running on schedule
                  unless the pipeline genuinely wrote a run entry.
                </p>
              )}
            </div>
            <div className="ml-auto">
              <Link
                href="/admin/config"
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ color: "#221A00", background: "var(--ember)" }}
              >
                Configure →
              </Link>
            </div>
          </div>
        );
      })()}

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        {/* Data Pipeline card */}
        <div className="dash-card rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(20,160,95,0.14)", color: "#14A05F" }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-leaf2" style={{ fontFamily: "var(--font-label)" }}>
              Data Pipeline
            </h2>
          </div>

          <InfoRow label="Schedule (Cron)" value={scheduleConfig?.value || "Not set"} />
          <InfoRow label="API-Football Key" value={apiConfig?.value || "Not set"} masked={!!apiConfig?.value} />
          <InfoRow
            label="Active Competitions"
            value={competitionsConfig?.value || "Not set"}
            mono={false}
          />
        </div>

        {/* Model card */}
        <div className="dash-card rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(242,176,28,0.14)", color: "#C98900" }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-flame" style={{ fontFamily: "var(--font-label)" }}>
              Model
            </h2>
          </div>

          <InfoRow label="Active Model" value={modelConfig?.value || "Not set"} />
          <InfoRow
            label="Last Run Model"
            value={run?.model_version || "—"}
          />
          <InfoRow
            label="Fixtures Processed"
            value={run?.fixtures_processed != null ? String(run.fixtures_processed) : "—"}
          />
          <InfoRow
            label="Predictions Written"
            value={run?.predictions_written != null ? String(run.predictions_written) : "—"}
          />
          <InfoRow
            label="Track Record Synced"
            value={run?.track_record_synced != null ? String(run.track_record_synced) : "—"}
          />
          <div className="flex items-center justify-between py-3 border-b border-chalk/10">
            <span className="text-sm text-stale">Status</span>
            <span className="text-xs text-stale">
              Configure via{" "}
              <Link href="/admin/config" className="hover:underline text-flame">
                System Config
              </Link>
            </span>
          </div>
        </div>
      </div>

      {/* About the pipeline */}
      <div className="dash-card rounded-2xl p-6">
        <h2 className="text-base font-semibold mb-3 text-chalk" style={{ fontFamily: "var(--font-label)" }}>
          About the Pipeline
        </h2>
        <p className="text-sm leading-relaxed mb-3 text-stale">
          The Onside prediction pipeline runs as a scheduled Python job. It pulls live data from
          API-Football, engineers features (rolling form, xG/xA, head-to-head, rest days, injuries),
          and runs the prediction model to generate match outcome and player prop predictions.
          Results are written to the PostgreSQL database and displayed on this dashboard.
        </p>
        <p className="text-sm leading-relaxed text-stale">
          To modify pipeline settings, API keys, model parameters, or competition selections,
          use the{" "}
          <Link href="/admin/config" className="font-medium hover:underline text-leaf2">
            System Config
          </Link>{" "}
          page. All settings are stored in the database and take effect without code changes.
        </p>
      </div>
    </div>
  );
}