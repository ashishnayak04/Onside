"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

type Prediction = Record<string, unknown>;

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

function ProbBar({ homeProb, drawProb, awayProb }: { homeProb: number; drawProb: number; awayProb: number }) {
  return (
    <div className="flex rounded-full overflow-hidden h-1.5 w-full">
      <div className="prob-bar-home transition-all" style={{ width: `${homeProb}%` }} />
      <div className="prob-bar-draw transition-all" style={{ width: `${drawProb}%` }} />
      <div className="prob-bar-away transition-all" style={{ width: `${awayProb}%` }} />
    </div>
  );
}

const FILTERS = ["All", "La Liga", "UCL"] as const;
type Filter = (typeof FILTERS)[number];

export default function PredictionsClient({ predictions }: { predictions: Prediction[] }) {
  const [activeFilter, setActiveFilter] = useState<Filter>("All");

  const filtered = useMemo(() => {
    if (activeFilter === "All") return predictions;
    return predictions.filter((p) => {
      const comp = ((p.competition as string) ?? "").toLowerCase();
      if (activeFilter === "La Liga") return comp.includes("la liga") || comp.includes("laliga");
      if (activeFilter === "UCL") return comp.includes("ucl") || comp.includes("champions");
      return true;
    });
  }, [predictions, activeFilter]);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="page-header mb-1">
            Predictions<span className="text-ember">.</span>
          </h1>
          <p className="text-sm text-stale">
            {predictions.length} total · {filtered.length} shown
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

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="dash-card p-16 text-center">
          <p className="text-sm font-medium text-stale">
            No predictions found{activeFilter !== "All" ? ` for ${activeFilter}` : "."}.
          </p>
          {activeFilter !== "All" && (
            <button
              onClick={() => setActiveFilter("All")}
              className="mt-3 text-xs font-semibold text-flame"
            >
              Show all →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((pred) => {
            const homeP = Math.round((pred.home_win_prob as number) * 100);
            const drawP = Math.round((pred.draw_prob as number) * 100);
            const awayP = Math.round((pred.away_win_prob as number) * 100);
            const conf = Math.round((pred.confidence as number) * 100);

            return (
              <Link
                key={pred.id as string}
                href={`/dashboard/matches/${pred.match_id as string}`}
                className="dash-card block p-5 group transition-all"
                style={{ textDecoration: "none" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(20,160,95,0.03)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "white"; }}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="text-right flex-1 min-w-0">
                      <p className="text-sm font-bold truncate text-chalk">
                        {(pred.home_team_name as string) || "TBD"}
                      </p>
                    </div>
                    <div
                      className="px-3 py-1 rounded-lg shrink-0"
                      style={{ background: "var(--ink)" }}
                    >
                      <span className="text-xs font-mono font-bold text-chalk">
                        {pred.predicted_home_score as number}
                      </span>
                      <span className="text-xs mx-1 text-stale">-</span>
                      <span className="text-xs font-mono font-bold text-chalk">
                        {pred.predicted_away_score as number}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate text-chalk">
                        {(pred.away_team_name as string) || "TBD"}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <CompBadge competition={pred.competition as string} />
                    <p className="text-xs mt-1 text-stale">
                      {new Date(pred.match_date as string).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                </div>

                {/* Probability bar */}
                <ProbBar homeProb={homeP} drawProb={drawP} awayProb={awayP} />

                {/* Bottom row */}
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-3 text-xs" style={{ fontFamily: "var(--font-label)" }}>
                    <span style={{ color: "#0B7A45" }}>
                      H <strong>{homeP}%</strong>
                    </span>
                    <span style={{ color: "#94a3b8" }}>
                      D <strong>{drawP}%</strong>
                    </span>
                    <span style={{ color: "#C98900" }}>
                      A <strong>{awayP}%</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-stale">Confidence</span>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded"
                      style={{
                        background: conf >= 70 ? "rgba(20,160,95,0.12)" : conf >= 50 ? "rgba(242,176,28,0.16)" : "rgba(217,59,62,0.10)",
                        color: conf >= 70 ? "#0B7A45" : conf >= 50 ? "#C98900" : "#B3272A",
                        fontFamily: "var(--font-label)",
                      }}
                    >
                      {conf}%
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}