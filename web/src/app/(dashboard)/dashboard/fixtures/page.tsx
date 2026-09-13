import { query } from "@/lib/db";
import FixturesClient from "@/components/FixturesClient";

export default async function FixturesPage() {
  let matches: Record<string, unknown>[] = [];
  try {
    matches = await query(`
      SELECT m.*, ht.name as home_team_name, ht.short_name as home_short,
        at.name as away_team_name, at.short_name as away_short,
        p.predicted_outcome, p.confidence, p.home_win_prob, p.draw_prob, p.away_win_prob
      FROM matches m
      LEFT JOIN teams ht ON m.home_team_id = ht.id
      LEFT JOIN teams at ON m.away_team_id = at.id
      LEFT JOIN LATERAL (
        SELECT predicted_outcome, confidence, home_win_prob, draw_prob, away_win_prob
        FROM predictions
        WHERE match_id = m.id
        ORDER BY created_at DESC
        LIMIT 1
      ) p ON TRUE
      WHERE m.status = 'scheduled'
      ORDER BY m.match_date ASC
      LIMIT 100
    `);
  } catch (e) {
    console.error("Fixtures query failed:", e);
  }

  return <FixturesClient matches={matches} />;
}
