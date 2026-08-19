"use client";

import { useEffect, useState } from "react";

interface ConfigEntry {
  key: string;
  value: string;
  description: string | null;
}

export default function PipelinePage() {
  const [configs, setConfigs] = useState<ConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/config");
        const data = await res.json();
        setConfigs(data.configs || []);
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
    return <div className="text-[#71717a]">Loading pipeline info...</div>;
  }

  const modelConfig = get("prediction_model");
  const scheduleConfig = get("pipeline_schedule_cron");
  const apiConfig = get("api_football_key");
  const competitionsConfig = get("active_competitions");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Pipeline Configuration</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Data Pipeline</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-[#71717a]">Schedule (Cron)</span>
              <span className="text-sm font-mono text-[#22c55e]">{scheduleConfig?.value || "Not set"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#71717a]">API-Football Key</span>
              <span className="text-sm font-mono text-[#22c55e]">{apiConfig?.value ? "••••••••" : "Not set"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#71717a]">Active Competitions</span>
              <span className="text-sm text-[#a1a1aa]">{competitionsConfig?.value || "Not set"}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Model</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-[#71717a]">Active Model</span>
              <span className="text-sm font-mono text-[#22c55e]">{modelConfig?.value || "Not set"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#71717a]">Status</span>
              <span className="text-sm text-[#71717a]">
                Configure via the System Config page
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-[#18181b] border border-[#27272a] rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-2">About the Pipeline</h2>
        <p className="text-sm text-[#71717a] leading-relaxed">
          The Onside prediction pipeline runs as a scheduled Python job. It pulls live data from
          API-Football, engineers features (rolling form, xG/xA, head-to-head, rest days, injuries),
          and runs the prediction model to generate match outcome and player prop predictions.
          Results are written to the PostgreSQL database and displayed on this dashboard.
        </p>
        <p className="text-sm text-[#71717a] leading-relaxed mt-3">
          To modify pipeline settings, API keys, model parameters, or competition selections,
          use the <a href="/admin/config" className="text-[#22c55e] hover:underline">System Config</a> page.
          All settings are stored in the database and take effect without code changes.
        </p>
      </div>
    </div>
  );
}
