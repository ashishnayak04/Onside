import { query } from "@/lib/db";
import PredictionsClient from "@/components/PredictionsClient";

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
  } catch (e) {
    console.error("Predictions query failed:", e);
  }

  return <PredictionsClient predictions={predictions} />;
}
