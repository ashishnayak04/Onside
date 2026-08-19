import { query } from "@/lib/db";
import Link from "next/link";

export default async function FixturesPage() {
  let matches: Record<string, unknown>[] = [];
  try {
    matches = await query(`
      SELECT m.*, ht.name as home_team_name, ht.short_name as home_short,
        at.name as away_team_name, at.short_name as away_short,
        p.predicted_outcome, p.confidence
      FROM matches m
      LEFT JOIN teams ht ON m.home_team_id = ht.id
      LEFT JOIN teams at ON m.away_team_id = at.id
      LEFT JOIN predictions p ON p.match_id = m.id
      ORDER BY m.match_date ASC
    `);
  } catch {
    // DB may not be connected
  }

  const grouped: Record<string, Record<string, unknown>[]> = {};
  for (const match of matches) {
    const comp = (match.competition as string) || "Unknown";
    if (!grouped[comp]) grouped[comp] = [];
    grouped[comp].push(match);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Fixtures</h1>

      {Object.keys(grouped).length === 0 ? (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-8 text-center text-[#71717a]">
          No fixtures available. Matches will appear here once data is ingested.
        </div>
      ) : (
        Object.entries(grouped).map(([competition, compMatches]) => (
          <div key={competition} className="mb-8">
            <h2 className="text-sm font-semibold text-[#71717a] uppercase tracking-wider mb-3">
              {competition}
            </h2>
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden divide-y divide-[#27272a]">
              {compMatches.map((match) => (
                <Link
                  key={match.id as string}
                  href={`/dashboard/matches/${match.id as string}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-[#27272a]/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="text-right flex-1">
                      <p className="font-medium">{(match.home_team_name as string) || "TBD"}</p>
                    </div>
                    <div className="bg-[#27272a] px-4 py-1.5 rounded text-sm font-mono text-[#71717a]">
                      vs
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{(match.away_team_name as string) || "TBD"}</p>
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    {match.predicted_outcome ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#22c55e]/10 text-[#22c55e]">
                        {match.predicted_outcome as string} · {Math.round((match.confidence as number) * 100)}%
                      </span>
                    ) : (
                      <span className="text-xs text-[#71717a]">No prediction</span>
                    )}
                    <p className="text-xs text-[#a1a1aa] mt-1">
                      {new Date(match.match_date as string).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
