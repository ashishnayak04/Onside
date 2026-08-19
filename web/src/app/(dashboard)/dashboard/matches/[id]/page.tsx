import { query, queryOne } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
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

  return (
    <div>
      <Link href="/dashboard/fixtures" className="text-sm text-[#22c55e] hover:underline mb-4 inline-block">
        &larr; Back to Fixtures
      </Link>

      {/* Match Header */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-8 mb-6">
        <p className="text-xs text-[#71717a] uppercase tracking-wider mb-4 text-center">
          {match.competition as string} &middot; {new Date(match.match_date as string).toLocaleDateString("en-GB", {
            weekday: "long", day: "numeric", month: "long", year: "numeric"
          })}
        </p>
        <div className="flex items-center justify-center gap-8">
          <div className="text-right">
            <p className="text-2xl font-bold">{(match.home_team_name as string) || "TBD"}</p>
            {match.home_score !== null && (
              <p className="text-4xl font-bold text-[#22c55e] mt-2">{match.home_score as number}</p>
            )}
          </div>
          <div className="text-[#71717a] text-lg">vs</div>
          <div className="text-left">
            <p className="text-2xl font-bold">{(match.away_team_name as string) || "TBD"}</p>
            {match.away_score !== null && (
              <p className="text-4xl font-bold text-[#22c55e] mt-2">{match.away_score as number}</p>
            )}
          </div>
        </div>
        {match.venue ? (
          <p className="text-center text-sm text-[#71717a] mt-4">{String(match.venue)}</p>
        ) : null}
      </div>

      {prediction ? (
        <>
          {/* Prediction Overview */}
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Match Prediction</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center p-4 rounded-lg bg-[#22c55e]/10">
                <p className="text-sm text-[#71717a]">Home Win</p>
                <p className="text-2xl font-bold text-[#22c55e]">
                  {Math.round((prediction.home_win_prob as number) * 100)}%
                </p>
              </div>
              <div className="text-center p-4 rounded-lg bg-[#71717a]/10">
                <p className="text-sm text-[#71717a]">Draw</p>
                <p className="text-2xl font-bold text-[#a1a1aa]">
                  {Math.round((prediction.draw_prob as number) * 100)}%
                </p>
              </div>
              <div className="text-center p-4 rounded-lg bg-[#3b82f6]/10">
                <p className="text-sm text-[#71717a]">Away Win</p>
                <p className="text-2xl font-bold text-[#3b82f6]">
                  {Math.round((prediction.away_win_prob as number) * 100)}%
                </p>
              </div>
              <div className="text-center p-4 rounded-lg bg-[#f59e0b]/10">
                <p className="text-sm text-[#71717a]">Confidence</p>
                <p className="text-2xl font-bold text-[#f59e0b]">
                  {Math.round((prediction.confidence as number) * 100)}%
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center gap-4">
              <p className="text-sm text-[#71717a]">Predicted Scoreline:</p>
              <p className="text-lg font-bold text-[#22c55e]">
                {prediction.predicted_home_score as number} - {prediction.predicted_away_score as number}
              </p>
              {prediction.model_version ? (
                <span className="text-xs text-[#71717a] bg-[#27272a] px-2 py-1 rounded">
                  Model: {String(prediction.model_version)}
                </span>
              ) : null}
            </div>
          </div>

          {/* Player Props */}
          {playerPredictions.length > 0 && (
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden mb-6">
              <div className="px-6 py-4 border-b border-[#27272a]">
                <h2 className="text-lg font-semibold">Player Props</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#27272a]">
                    <th className="text-left text-xs font-medium text-[#71717a] uppercase px-4 py-3">Player</th>
                    <th className="text-left text-xs font-medium text-[#71717a] uppercase px-4 py-3">Team</th>
                    <th className="text-left text-xs font-medium text-[#71717a] uppercase px-4 py-3">Position</th>
                    <th className="text-center text-xs font-medium text-[#71717a] uppercase px-4 py-3">Goal %</th>
                    <th className="text-center text-xs font-medium text-[#71717a] uppercase px-4 py-3">Assist %</th>
                    <th className="text-center text-xs font-medium text-[#71717a] uppercase px-4 py-3">Shots on Target %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#27272a]">
                  {playerPredictions.map((pp) => (
                    <tr key={pp.id as string} className="hover:bg-[#27272a]/30">
                      <td className="px-4 py-3 text-sm font-medium">{pp.player_name as string}</td>
                      <td className="px-4 py-3 text-sm text-[#71717a]">{pp.team_name as string}</td>
                      <td className="px-4 py-3 text-sm text-[#71717a]">{pp.position as string}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-mono text-[#22c55e]">{Math.round((pp.goal_prob as number) * 100)}%</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-mono text-[#3b82f6]">{Math.round((pp.assist_prob as number) * 100)}%</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-mono text-[#f59e0b]">{Math.round((pp.shots_on_target_prob as number) * 100)}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Explainability Panel */}
          {featureSnapshot && (
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Why This Prediction?</h2>
              <p className="text-sm text-[#71717a] mb-4">
                The following stats were used to generate this prediction:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(featureSnapshot).map(([key, value]) => (
                  <div key={key} className="bg-[#27272a]/50 rounded-lg p-3">
                    <p className="text-xs text-[#71717a] uppercase tracking-wider">
                      {key.replace(/_/g, " ")}
                    </p>
                    <p className="text-sm font-medium mt-1">
                      {typeof value === "number" ? value.toFixed(2) : String(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-8 text-center text-[#71717a]">
          No prediction available for this match yet.
        </div>
      )}
    </div>
  );
}
