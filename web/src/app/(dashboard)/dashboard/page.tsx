import { query } from "@/lib/db";
import Link from "next/link";

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

export default async function DashboardHome() {
  let matches: Record<string, unknown>[] = [];
  let stats = { total: 0, correct: 0, accuracy: 0 };
  try {
    matches = await query(`
      SELECT m.*, ht.name as home_team_name, ht.short_name as home_short,
        at.name as away_team_name, at.short_name as away_short
      FROM matches m
      LEFT JOIN teams ht ON m.home_team_id = ht.id
      LEFT JOIN teams at ON m.away_team_id = at.id
      WHERE m.status = 'scheduled'
      ORDER BY m.match_date ASC
      LIMIT 10
    `);
    const acc = await query<{ total_predictions: string; correct_predictions: string; accuracy: number }>(`
      SELECT COUNT(*) as total_predictions,
        COUNT(*) FILTER (WHERE was_correct = true) as correct_predictions,
        ROUND(COUNT(*) FILTER (WHERE was_correct = true)::decimal / NULLIF(COUNT(*), 0) * 100, 1) as accuracy
      FROM track_record
    `);
    if (acc[0]) {
      stats = {
        total: parseInt(acc[0].total_predictions || "0", 10),
        correct: parseInt(acc[0].correct_predictions || "0", 10),
        accuracy: parseFloat(String(acc[0].accuracy || "0")),
      };
    }
  } catch (e) {
    console.error("Dashboard query failed:", e);
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="page-header mb-1">Dashboard</h1>
        <p className="text-sm" style={{ color: "var(--forest-mid)", opacity: 0.7 }}>
          Your predictions overview at a glance
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="dash-card stat-accent-green p-6">
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--forest-mid)", opacity: 0.6, fontFamily: "var(--font-label)" }}>
            Upcoming Fixtures
          </p>
          <p className="text-4xl font-black" style={{ color: "var(--forest)", fontFamily: "var(--font-headline)" }}>
            {matches.length}
          </p>
          <p className="text-xs mt-2" style={{ color: "var(--forest-mid)", opacity: 0.5 }}>scheduled matches</p>
        </div>
        <div className="dash-card stat-accent-blue p-6">
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--forest-mid)", opacity: 0.6, fontFamily: "var(--font-label)" }}>
            Total Predictions
          </p>
          <p className="text-4xl font-black" style={{ color: "#2563eb", fontFamily: "var(--font-headline)" }}>
            {stats.total}
          </p>
          <p className="text-xs mt-2" style={{ color: "var(--forest-mid)", opacity: 0.5 }}>predictions made</p>
        </div>
        <div className="dash-card stat-accent-amber p-6">
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--forest-mid)", opacity: 0.6, fontFamily: "var(--font-label)" }}>
            Accuracy
          </p>
          <p className="text-4xl font-black" style={{ color: "#d97706", fontFamily: "var(--font-headline)" }}>
            {stats.total > 0 ? `${stats.accuracy}%` : "—"}
          </p>
          <p className="text-xs mt-2" style={{ color: "var(--forest-mid)", opacity: 0.5 }}>
            {stats.correct} correct of {stats.total}
          </p>
        </div>
      </div>

      {/* Upcoming fixtures */}
      <div className="dash-card overflow-hidden">
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1.5px solid var(--border)" }}
        >
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--forest)" }}>Upcoming Fixtures</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--forest-mid)", opacity: 0.6 }}>Next scheduled matches</p>
          </div>
          <Link
            href="/dashboard/fixtures"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: "rgba(13,51,32,0.07)",
              color: "var(--forest-mid)",
              fontFamily: "var(--font-label)",
            }}
          >
            View all →
          </Link>
        </div>

        {matches.length === 0 ? (
          <div className="p-12 text-center">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(13,51,32,0.06)" }}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "var(--forest-mid)", opacity: 0.4 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm" style={{ color: "var(--forest-mid)", opacity: 0.5 }}>No upcoming fixtures. Add matches to see predictions.</p>
          </div>
        ) : (
          <div>
            {matches.map((match, i) => (
              <Link
                key={match.id as string}
                href={`/dashboard/matches/${match.id as string}`}
                className="flex items-center gap-4 px-6 py-4 transition-all duration-150 group"
                style={{
                  borderBottom: i < matches.length - 1 ? "1px solid var(--border)" : "none",
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
                  <CompBadge competition={match.competition as string} />
                  <p className="text-xs" style={{ color: "var(--forest-mid)", opacity: 0.55 }}>
                    {new Date(match.match_date as string).toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>

                <svg className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "var(--forest)" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
