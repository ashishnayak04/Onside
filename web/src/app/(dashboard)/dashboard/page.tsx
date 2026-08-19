import { query } from "@/lib/db";
import Link from "next/link";

export default async function DashboardHome() {
  let matches: Record<string, unknown>[] = [];
  let stats = { total: 0, predicted: 0, accuracy: 0 };
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
        predicted: parseInt(acc[0].correct_predictions || "0", 10),
        accuracy: parseFloat(String(acc[0].accuracy || "0")),
      };
    }
  } catch {
    // DB may not be connected
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
          <p className="text-sm text-[#71717a]">Upcoming Fixtures</p>
          <p className="text-3xl font-bold text-[#22c55e] mt-2">{matches.length}</p>
        </div>
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
          <p className="text-sm text-[#71717a]">Total Predictions</p>
          <p className="text-3xl font-bold text-[#3b82f6] mt-2">{stats.total}</p>
        </div>
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
          <p className="text-sm text-[#71717a]">Accuracy</p>
          <p className="text-3xl font-bold text-[#f59e0b] mt-2">
            {stats.total > 0 ? `${stats.accuracy}%` : "N/A"}
          </p>
        </div>
      </div>

      <div className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#27272a] flex items-center justify-between">
          <h2 className="text-lg font-semibold">Upcoming Fixtures</h2>
          <Link href="/dashboard/fixtures" className="text-sm text-[#22c55e] hover:underline">
            View all
          </Link>
        </div>
        {matches.length === 0 ? (
          <div className="p-8 text-center text-[#71717a]">
            No upcoming fixtures. Add matches to the database to see predictions.
          </div>
        ) : (
          <div className="divide-y divide-[#27272a]">
            {matches.map((match) => (
              <Link
                key={match.id as string}
                href={`/dashboard/matches/${match.id as string}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-[#27272a]/50 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="text-right flex-1">
                    <p className="font-medium">{(match.home_team_name as string) || "TBD"}</p>
                  </div>
                  <div className="bg-[#27272a] px-3 py-1 rounded text-sm font-mono text-[#71717a]">
                    vs
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{(match.away_team_name as string) || "TBD"}</p>
                  </div>
                </div>
                <div className="text-right ml-4">
                  <p className="text-sm text-[#71717a]">{match.competition as string}</p>
                  <p className="text-xs text-[#a1a1aa]">
                    {new Date(match.match_date as string).toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
