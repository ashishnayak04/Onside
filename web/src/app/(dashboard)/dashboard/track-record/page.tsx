import { query, queryOne } from "@/lib/db";
import TrackRecordClient from "@/components/TrackRecordClient";

export default async function TrackRecordPage() {
  let records: Record<string, unknown>[] = [];
  let stats = { total_predictions: "0", correct_predictions: "0", accuracy: 0 };
  try {
    records = await query(`
      SELECT tr.*,
        m.competition,
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
  } catch (e) {
    console.error("Track record query failed:", e);
  }

  return <TrackRecordClient records={records} stats={stats} />;
}
