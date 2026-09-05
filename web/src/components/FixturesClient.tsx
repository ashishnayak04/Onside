"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

type Match = Record<string, unknown>;

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

export default function FixturesClient({ matches }: { matches: Match[] }) {
  const [activeFilter, setActiveFilter] = useState<Filter>("All");

  const filtered = useMemo(() => {
    if (activeFilter === "All") return matches;
    return matches.filter((m) => {
      const comp = ((m.competition as string) ?? "").toLowerCase();
      if (activeFilter === "La Liga") return comp.includes("la liga") || comp.includes("laliga");
      if (activeFilter === "UCL") return comp.includes("ucl") || comp.includes("champions");
      return true;
    });
  }, [matches, activeFilter]);

  // Group by competition
  const grouped = useMemo(() => {
    const g: Record<string, Match[]> = {};
    for (const match of filtered) {
      const comp = (match.competition as string) || "Unknown";
      if (!g[comp]) g[comp] = [];
      g[comp].push(match);
    }
    return g;
  }, [filtered]);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="page-header mb-1">Fixtures</h1>
          <p className="text-sm" style={{ color: "var(--forest-mid)", opacity: 0.7 }}>
            {matches.length} total · {filtered.length} shown
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
              {f === "La Liga" && (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                </svg>
              )}
              {f === "UCL" && (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z"/>
                </svg>
              )}
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {Object.keys(grouped).length === 0 ? (
        <div
          className="dash-card p-16 text-center"
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "rgba(13,51,32,0.06)" }}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "var(--forest-mid)", opacity: 0.4 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium" style={{ color: "var(--forest)", opacity: 0.6 }}>
            No fixtures found{activeFilter !== "All" ? ` for ${activeFilter}` : ""}.
          </p>
          {activeFilter !== "All" && (
            <button
              onClick={() => setActiveFilter("All")}
              className="mt-3 text-xs font-semibold"
              style={{ color: "var(--forest-mid)" }}
            >
              Show all fixtures →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([competition, compMatches]) => (
            <div key={competition}>
              <div className="flex items-center gap-3 mb-3">
                <CompBadge competition={competition} />
                <span className="text-xs font-medium" style={{ color: "var(--forest-mid)", opacity: 0.5 }}>
                  {compMatches.length} match{compMatches.length !== 1 ? "es" : ""}
                </span>
              </div>
              <div className="dash-card overflow-hidden">
                {compMatches.map((match, i) => (
                  <Link
                    key={match.id as string}
                    href={`/dashboard/matches/${match.id as string}`}
                    className="flex items-center gap-4 px-6 py-4 transition-all duration-150 group"
                    style={{
                      borderBottom: i < compMatches.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(13,51,32,0.03)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                  >
                    {/* Teams */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="text-right flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--forest)" }}>
                          {(match.home_team_name as string) || "TBD"}
                        </p>
                      </div>
                      <div
                        className="px-3 py-1 rounded-lg text-xs font-mono shrink-0"
                        style={{ background: "var(--mist)", color: "var(--forest-mid)" }}
                      >
                        VS
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--forest)" }}>
                          {(match.away_team_name as string) || "TBD"}
                        </p>
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                      {match.predicted_outcome ? (
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                          style={{
                            background: "rgba(27,94,55,0.10)",
                            color: "var(--forest-mid)",
                            fontFamily: "var(--font-label)",
                          }}
                        >
                          {match.predicted_outcome as string} · {Math.round((match.confidence as number) * 100)}%
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--forest-mid)", opacity: 0.4 }}>
                          No prediction
                        </span>
                      )}
                      <p className="text-xs" style={{ color: "var(--forest-mid)", opacity: 0.5 }}>
                        {new Date(match.match_date as string).toLocaleDateString("en-GB", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>

                    <svg
                      className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-30 transition-opacity"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      style={{ color: "var(--forest)" }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
