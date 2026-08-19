import { query } from "@/lib/db";
import Link from "next/link";

export default async function PredictionsPage() {
  let predictions: Record<string, unknown>[] = [];
  try {
    predictions = await query(`
      SELECT p.*, m.match_date, m.competition, m.home_score, m.away_score, m.status,
        ht.name as home_team_name, at.name as away_team_name
      FROM predictions p
      JOIN matches m ON p.match_id = m.id
      LEFT JOIN teams ht ON m.home_team_id = ht.id
      LEFT JOIN teams at ON m.away_team_id = at.id
      ORDER BY m.match_date DESC
      LIMIT 50
    `);
  } catch {
    // DB may not be connected
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Predictions</h1>

      {predictions.length === 0 ? (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-8 text-center text-[#71717a]">
          No predictions yet. Predictions will appear once the pipeline runs.
        </div>
      ) : (
        <div className="space-y-3">
          {predictions.map((pred) => (
            <Link
              key={pred.id as string}
              href={`/dashboard/matches/${pred.match_id as string}`}
              className="block bg-[#18181b] border border-[#27272a] rounded-xl p-5 hover:border-[#22c55e]/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4 flex-1">
                  <div className="text-right flex-1">
                    <p className="font-medium">{(pred.home_team_name as string) || "TBD"}</p>
                  </div>
                  <div className="px-3 py-1 rounded bg-[#27272a] text-sm font-mono">
                    <span className="text-[#22c55e]">{pred.predicted_home_score as number}</span>
                    <span className="text-[#71717a] mx-1">-</span>
                    <span className="text-[#22c55e]">{pred.predicted_away_score as number}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{(pred.away_team_name as string) || "TBD"}</p>
                  </div>
                </div>
                <div className="text-right ml-4">
                  <p className="text-sm text-[#71717a]">{pred.competition as string}</p>
                  <p className="text-xs text-[#a1a1aa]">
                    {new Date(pred.match_date as string).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex gap-2 flex-1">
                  <span className="text-xs px-2 py-1 rounded bg-[#22c55e]/10 text-[#22c55e]">
                    Home {Math.round((pred.home_win_prob as number) * 100)}%
                  </span>
                  <span className="text-xs px-2 py-1 rounded bg-[#71717a]/20 text-[#a1a1aa]">
                    Draw {Math.round((pred.draw_prob as number) * 100)}%
                  </span>
                  <span className="text-xs px-2 py-1 rounded bg-[#3b82f6]/10 text-[#3b82f6]">
                    Away {Math.round((pred.away_win_prob as number) * 100)}%
                  </span>
                </div>
                <div className="text-xs text-[#71717a]">
                  Confidence: <span className="text-[#f59e0b]">{Math.round((pred.confidence as number) * 100)}%</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
