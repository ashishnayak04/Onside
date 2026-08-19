import { query, queryOne } from "@/lib/db";

export default async function TrackRecordPage() {
  let records: Record<string, unknown>[] = [];
  let stats = { total_predictions: "0", correct_predictions: "0", accuracy: 0 };
  try {
    records = await query(`
      SELECT tr.*,
        ht.name as home_team_name, at.name as away_team_name,
        p.predicted_home_score, p.predicted_away_score,
        m.match_date
      FROM track_record tr
      JOIN matches m ON tr.match_id = m.id
      LEFT JOIN teams ht ON m.home_team_id = ht.id
      LEFT JOIN teams at ON m.away_team_id = at.id
      JOIN predictions p ON tr.prediction_id = p.id
      ORDER BY m.match_date DESC
      LIMIT 50
    `);
    const s = await queryOne<{
      total_predictions: string;
      correct_predictions: string;
      accuracy: number;
    }>(`
      SELECT COUNT(*) as total_predictions,
        COUNT(*) FILTER (WHERE was_correct = true) as correct_predictions,
        ROUND(COUNT(*) FILTER (WHERE was_correct = true)::decimal / NULLIF(COUNT(*), 0) * 100, 1) as accuracy
      FROM track_record
    `);
    if (s) stats = s;
  } catch {
    // DB may not be connected
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Track Record</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
          <p className="text-sm text-[#71717a]">Total Predictions</p>
          <p className="text-3xl font-bold text-[#3b82f6] mt-2">{stats.total_predictions}</p>
        </div>
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
          <p className="text-sm text-[#71717a]">Correct</p>
          <p className="text-3xl font-bold text-[#22c55e] mt-2">{stats.correct_predictions}</p>
        </div>
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
          <p className="text-sm text-[#71717a]">Accuracy</p>
          <p className="text-3xl font-bold text-[#f59e0b] mt-2">
            {parseInt(stats.total_predictions) > 0 ? `${stats.accuracy}%` : "N/A"}
          </p>
        </div>
      </div>

      <div className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#27272a]">
              <th className="text-left text-xs font-medium text-[#71717a] uppercase px-4 py-3">Match</th>
              <th className="text-center text-xs font-medium text-[#71717a] uppercase px-4 py-3">Predicted</th>
              <th className="text-center text-xs font-medium text-[#71717a] uppercase px-4 py-3">Actual</th>
              <th className="text-center text-xs font-medium text-[#71717a] uppercase px-4 py-3">Outcome</th>
              <th className="text-center text-xs font-medium text-[#71717a] uppercase px-4 py-3">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#27272a]">
            {records.map((r) => (
              <tr key={r.id as string} className="hover:bg-[#27272a]/30">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium">
                    {(r.home_team_name as string) || "TBD"} vs {(r.away_team_name as string) || "TBD"}
                  </p>
                  <p className="text-xs text-[#71717a]">
                    {r.match_date ? new Date(r.match_date as string).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric"
                    }) : "-"}
                  </p>
                </td>
                <td className="px-4 py-3 text-center text-sm font-mono text-[#22c55e]">
                  {r.predicted_home_score as number} - {r.predicted_away_score as number}
                </td>
                <td className="px-4 py-3 text-center text-sm font-mono">
                  {r.actual_home_score !== null ? `${r.actual_home_score} - ${r.actual_away_score}` : "-"}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-sm text-[#a1a1aa]">{r.predicted_outcome as string}</span>
                  {r.actual_outcome ? (
                    <span className="text-xs text-[#71717a] block">&rarr; {String(r.actual_outcome)}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-center">
                  {r.was_correct === true ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400">
                      Correct
                    </span>
                  ) : r.was_correct === false ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400">
                      Wrong
                    </span>
                  ) : (
                    <span className="text-xs text-[#71717a]">Pending</span>
                  )}
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[#71717a]">
                  No track record data yet. Results will appear after matches are completed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
