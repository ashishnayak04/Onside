import { query, queryOne } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

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

function ProbCard({
  label,
  value,
  accentColor,
  bg,
}: {
  label: string;
  value: string;
  accentColor: string;
  bg: string;
}) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col items-center gap-1 flex-1"
      style={{ background: bg, border: `1.5px solid ${accentColor}22` }}
    >
      <p
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: accentColor, opacity: 0.8, fontFamily: "var(--font-label)" }}
      >
        {label}
      </p>
      <p
        className="text-3xl font-black"
        style={{ color: accentColor, fontFamily: "var(--font-headline)" }}
      >
        {value}
      </p>
    </div>
  );
}

export default async function MatchDetailPage({ params }: PageProps) {
  const { id } = await params;

  const match = await queryOne<Record<string, unknown>>(`
    SELECT m.*, ht.name as home_team_name, ht.short_name as home_short,
      at.name as away_team_name, at.short_name as away_short
    FROM matches m
    LEFT JOIN teams ht ON m.home_team_id = ht.id
    LEFT JOIN teams at ON m.away_team_id = at.id
    WHERE m.id = $1
  `, [id]);

  if (!match) notFound();

  const prediction = await queryOne<Record<string, unknown>>(`
    SELECT * FROM predictions WHERE match_id = $1 ORDER BY created_at DESC LIMIT 1
  `, [id]);

  let playerPredictions: Record<string, unknown>[] = [];
  if (prediction) {
    playerPredictions = await query(`
      SELECT pp.*, pl.name as player_name, t.name as team_name, pl.position
      FROM player_predictions pp
      JOIN players pl ON pp.player_id = pl.id
      LEFT JOIN teams t ON pl.team_id = t.id
      WHERE pp.prediction_id = $1
      ORDER BY pp.goal_prob DESC
    `, [prediction.id as string]);
  }

  const featureSnapshot = prediction?.feature_snapshot as Record<string, unknown> | null;

  const homeWin = prediction ? Math.round((prediction.home_win_prob as number) * 100) : 0;
  const draw = prediction ? Math.round((prediction.draw_prob as number) * 100) : 0;
  const awayWin = prediction ? Math.round((prediction.away_win_prob as number) * 100) : 0;
  const conf = prediction ? Math.round((prediction.confidence as number) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        href="/dashboard/fixtures"
        className="inline-flex items-center gap-1.5 text-sm font-medium mb-6 transition-opacity hover:opacity-70"
        style={{ color: "var(--forest-mid)", fontFamily: "var(--font-label)" }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Fixtures
      </Link>

      {/* Match Hero */}
      <div
        className="rounded-2xl overflow-hidden mb-6"
        style={{
          background: "linear-gradient(135deg, #0D3320 0%, #0A2818 100%)",
          border: "1.5px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* Competition + date bar */}
        <div
          className="px-6 py-3 flex items-center justify-between"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <CompBadge competition={match.competition as string} />
          <p
            className="text-xs uppercase tracking-wider"
            style={{ color: "rgba(255,255,255,0.45)", fontFamily: "var(--font-label)" }}
          >
            {new Date(match.match_date as string).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        {/* Teams */}
        <div className="px-6 py-8 flex flex-col sm:flex-row items-center justify-center gap-6">
          {/* Home */}
          <div className="flex-1 text-center sm:text-right">
            <p
              className="text-3xl sm:text-4xl font-black text-white"
              style={{ fontFamily: "var(--font-headline)", letterSpacing: "0.02em" }}
            >
              {(match.home_team_name as string) || "TBD"}
            </p>
            {match.home_score !== null && (
              <p className="text-5xl font-black mt-2" style={{ color: "#4ade80" }}>
                {match.home_score as number}
              </p>
            )}
          </div>

          <div
            className="px-5 py-2 rounded-xl text-lg font-bold shrink-0"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.5)",
              fontFamily: "var(--font-label)",
            }}
          >
            VS
          </div>

          {/* Away */}
          <div className="flex-1 text-center sm:text-left">
            <p
              className="text-3xl sm:text-4xl font-black text-white"
              style={{ fontFamily: "var(--font-headline)", letterSpacing: "0.02em" }}
            >
              {(match.away_team_name as string) || "TBD"}
            </p>
            {match.away_score !== null && (
              <p className="text-5xl font-black mt-2" style={{ color: "#4ade80" }}>
                {match.away_score as number}
              </p>
            )}
          </div>
        </div>

        {match.venue ? (
          <div
            className="px-6 py-3 text-center text-xs"
            style={{
              borderTop: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.35)",
              fontFamily: "var(--font-label)",
            }}
          >
            📍 {String(match.venue)}
          </div>
        ) : null}
      </div>

      {prediction ? (
        <>
          {/* Prediction Overview */}
          <div className="dash-card p-6 mb-6">
            <h2
              className="text-sm font-bold uppercase tracking-wider mb-5"
              style={{ color: "var(--forest)", opacity: 0.6, fontFamily: "var(--font-label)" }}
            >
              Match Prediction
            </h2>
            <div className="flex flex-wrap gap-3 mb-5">
              <ProbCard
                label="Home Win"
                value={`${homeWin}%`}
                accentColor="#1B5E37"
                bg="rgba(27,94,55,0.06)"
              />
              <ProbCard
                label="Draw"
                value={`${draw}%`}
                accentColor="#64748b"
                bg="rgba(100,116,139,0.06)"
              />
              <ProbCard
                label="Away Win"
                value={`${awayWin}%`}
                accentColor="#2563eb"
                bg="rgba(37,99,235,0.06)"
              />
              <ProbCard
                label="Confidence"
                value={`${conf}%`}
                accentColor="#d97706"
                bg="rgba(217,119,6,0.06)"
              />
            </div>

            {/* Probability bar */}
            <div className="flex rounded-full overflow-hidden h-2 mb-3">
              <div className="prob-bar-home transition-all" style={{ width: `${homeWin}%` }} />
              <div className="prob-bar-draw transition-all" style={{ width: `${draw}%` }} />
              <div className="prob-bar-away transition-all" style={{ width: `${awayWin}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs" style={{ fontFamily: "var(--font-label)", color: "var(--forest-mid)", opacity: 0.6 }}>
              <span>Home {homeWin}%</span>
              <span>Draw {draw}%</span>
              <span>Away {awayWin}%</span>
            </div>

            <div
              className="mt-5 pt-4 flex flex-wrap items-center gap-4"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <p className="text-sm" style={{ color: "var(--forest-mid)", opacity: 0.6 }}>Predicted Scoreline</p>
              <p
                className="text-2xl font-black"
                style={{ color: "var(--forest)", fontFamily: "var(--font-headline)" }}
              >
                {prediction.predicted_home_score as number} – {prediction.predicted_away_score as number}
              </p>
              {prediction.model_version ? (
                <span
                  className="text-xs px-2.5 py-1 rounded-full ml-auto"
                  style={{
                    background: "rgba(13,51,32,0.06)",
                    color: "var(--forest-mid)",
                    opacity: 0.7,
                    fontFamily: "var(--font-label)",
                  }}
                >
                  Model: {String(prediction.model_version)}
                </span>
              ) : null}
            </div>
          </div>

          {/* Player Props */}
          {playerPredictions.length > 0 && (
            <div className="dash-card overflow-hidden mb-6">
              <div
                className="px-6 py-4"
                style={{ borderBottom: "1.5px solid var(--border)" }}
              >
                <h2 className="text-sm font-bold" style={{ color: "var(--forest)" }}>
                  Player Props
                </h2>
              </div>
              <div className="table-scroll">
                <table className="w-full text-sm" style={{ minWidth: "560px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "rgba(13,51,32,0.025)" }}>
                      {["Player", "Team", "Position", "Goal %", "Assist %", "SOT %"].map((h) => (
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
                    {playerPredictions.map((pp, i) => (
                      <tr
                        key={pp.id as string}
                        style={{
                          borderBottom: i < playerPredictions.length - 1 ? "1px solid var(--border)" : "none",
                          background: i % 2 === 0 ? "white" : "rgba(13,51,32,0.015)",
                        }}
                      >
                        <td className="px-4 py-3 font-semibold" style={{ color: "var(--forest)" }}>
                          {pp.player_name as string}
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "var(--forest-mid)", opacity: 0.65 }}>
                          {pp.team_name as string}
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "var(--forest-mid)", opacity: 0.65 }}>
                          {pp.position as string}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-mono font-bold" style={{ color: "var(--forest-mid)" }}>
                            {Math.round((pp.goal_prob as number) * 100)}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-mono font-bold" style={{ color: "#2563eb" }}>
                            {Math.round((pp.assist_prob as number) * 100)}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-mono font-bold" style={{ color: "#d97706" }}>
                            {Math.round((pp.shots_on_target_prob as number) * 100)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Explainability Panel */}
          {featureSnapshot && (
            <div className="dash-card p-6">
              <h2
                className="text-sm font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--forest)", fontFamily: "var(--font-label)" }}
              >
                Why This Prediction?
              </h2>
              <p className="text-sm mb-5" style={{ color: "var(--forest-mid)", opacity: 0.6 }}>
                The following stats were used to generate this prediction:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(featureSnapshot).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-xl p-3.5"
                    style={{ background: "rgba(13,51,32,0.035)", border: "1px solid var(--border)" }}
                  >
                    <p
                      className="text-xs font-semibold uppercase tracking-wider mb-1"
                      style={{ color: "var(--forest-mid)", opacity: 0.55, fontFamily: "var(--font-label)" }}
                    >
                      {key.replace(/_/g, " ")}
                    </p>
                    <p className="text-sm font-bold" style={{ color: "var(--forest)" }}>
                      {typeof value === "number" ? value.toFixed(2) : String(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="dash-card p-16 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "rgba(13,51,32,0.06)" }}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "var(--forest-mid)", opacity: 0.4 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-sm" style={{ color: "var(--forest-mid)", opacity: 0.5 }}>
            No prediction available for this match yet.
          </p>
        </div>
      )}
    </div>
  );
}
