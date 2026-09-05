"use client";

import { useState, useMemo } from "react";

type Record_ = Record<string, unknown>;

function CompBadge({ competition }: { competition: string }) {
  const lower = competition?.toLowerCase() ?? "";
  const isLaLiga = lower.includes("la liga") || lower.includes("laliga");
  const isUCL = lower.includes("ucl") || lower.includes("champions");
  const cls = isLaLiga
    ? "comp-badge comp-badge-laliga"
    : isUCL
    ? "comp-badge comp-badge-ucl"
    : "comp-badge comp-badge-default";
  return <span className={cls}>{competition || "—"}</span>;
}

const FILTERS = ["All", "La Liga", "UCL"] as const;
type Filter = (typeof FILTERS)[number];

interface TrackRecordClientProps {
  records: Record_[];
  stats: { total_predictions: string; correct_predictions: string; accuracy: number };
}

export default function TrackRecordClient({ records, stats }: TrackRecordClientProps) {
  const [activeFilter, setActiveFilter] = useState<Filter>("All");

  const filtered = useMemo(() => {
    if (activeFilter === "All") return records;
    return records.filter((r) => {
      const comp = ((r.competition as string) ?? "").toLowerCase();
      if (activeFilter === "La Liga") return comp.includes("la liga") || comp.includes("laliga");
      if (activeFilter === "UCL") return comp.includes("ucl") || comp.includes("champions");
      return true;
    });
  }, [records, activeFilter]);

  const total = parseInt(stats.total_predictions ?? "0");
  const correct = parseInt(stats.correct_predictions ?? "0");

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="page-header mb-1">Track Record</h1>
          <p className="text-sm" style={{ color: "var(--forest-mid)", opacity: 0.7 }}>
            Model prediction accuracy history
          </p>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`filter-chip${activeFilter === f ? " active" : ""}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="dash-card stat-accent-blue p-6">
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--forest-mid)", opacity: 0.6, fontFamily: "var(--font-label)" }}>
            Total Predictions
          </p>
          <p className="text-4xl font-black" style={{ color: "#2563eb", fontFamily: "var(--font-headline)" }}>
            {total}
          </p>
        </div>
        <div className="dash-card stat-accent-green p-6">
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--forest-mid)", opacity: 0.6, fontFamily: "var(--font-label)" }}>
            Correct
          </p>
          <p className="text-4xl font-black" style={{ color: "var(--forest-mid)", fontFamily: "var(--font-headline)" }}>
            {correct}
          </p>
        </div>
        <div className="dash-card stat-accent-amber p-6">
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--forest-mid)", opacity: 0.6, fontFamily: "var(--font-label)" }}>
            Accuracy
          </p>
          <p className="text-4xl font-black" style={{ color: "#d97706", fontFamily: "var(--font-headline)" }}>
            {total > 0 ? `${stats.accuracy}%` : "—"}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="dash-card overflow-hidden">
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1.5px solid var(--border)" }}
        >
          <h2 className="text-sm font-bold" style={{ color: "var(--forest)" }}>
            Results
          </h2>
          <span className="text-xs" style={{ color: "var(--forest-mid)", opacity: 0.5 }}>
            {filtered.length} records
          </span>
        </div>

        <div className="table-scroll">
          <table className="w-full text-sm" style={{ minWidth: "560px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "rgba(13,51,32,0.025)" }}>
                {["Match", "Competition", "Predicted", "Actual", "Outcome", "Result"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--forest-mid)", opacity: 0.55, fontFamily: "var(--font-label)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.id as string}
                  style={{
                    borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none",
                    background: i % 2 === 0 ? "white" : "rgba(13,51,32,0.015)",
                  }}
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-sm" style={{ color: "var(--forest)" }}>
                      {(r.home_team_name as string) || "TBD"} vs {(r.away_team_name as string) || "TBD"}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--forest-mid)", opacity: 0.5 }}>
                      {r.match_date
                        ? new Date(r.match_date as string).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <CompBadge competition={(r.competition as string) ?? ""} />
                  </td>
                  <td className="px-4 py-3 font-mono text-sm font-bold" style={{ color: "var(--forest-mid)" }}>
                    {r.predicted_home_score as number} - {r.predicted_away_score as number}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm" style={{ color: "var(--forest)", opacity: 0.7 }}>
                    {r.actual_home_score !== null
                      ? `${r.actual_home_score} - ${r.actual_away_score}`
                      : <span style={{ opacity: 0.35 }}>—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm" style={{ color: "var(--forest-mid)", opacity: 0.8 }}>
                      {r.predicted_outcome as string}
                    </span>
                    {r.actual_outcome ? (
                      <span className="text-xs block" style={{ color: "var(--forest-mid)", opacity: 0.45 }}>
                        → {String(r.actual_outcome)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {r.was_correct === true ? (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                        style={{
                          background: "rgba(27,94,55,0.10)",
                          color: "var(--forest-mid)",
                          fontFamily: "var(--font-label)",
                        }}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        Correct
                      </span>
                    ) : r.was_correct === false ? (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                        style={{
                          background: "rgba(239,68,68,0.08)",
                          color: "#ef4444",
                          fontFamily: "var(--font-label)",
                        }}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Wrong
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--forest-mid)", opacity: 0.35 }}>
                        Pending
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm" style={{ color: "var(--forest-mid)", opacity: 0.45 }}>
                    No results{activeFilter !== "All" ? ` for ${activeFilter}` : ""}.{" "}
                    {activeFilter !== "All" && (
                      <button
                        onClick={() => setActiveFilter("All")}
                        className="underline"
                        style={{ color: "var(--forest-mid)" }}
                      >
                        Show all
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
