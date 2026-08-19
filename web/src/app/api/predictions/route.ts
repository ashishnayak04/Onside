import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get("match_id");

    if (matchId) {
      const predictions = await query(
        `SELECT p.*, m.home_team_id, m.away_team_id,
          ht.name as home_team_name, at.name as away_team_name,
          m.home_score, m.away_score, m.match_date, m.competition
         FROM predictions p
         JOIN matches m ON p.match_id = m.id
         LEFT JOIN teams ht ON m.home_team_id = ht.id
         LEFT JOIN teams at ON m.away_team_id = at.id
         WHERE p.match_id = $1
         ORDER BY p.created_at DESC LIMIT 1`,
        [matchId]
      );

      const playerPreds = predictions.length > 0
        ? await query(
            `SELECT pp.*, pl.name as player_name, t.name as team_name, pl.position
             FROM player_predictions pp
             JOIN players pl ON pp.player_id = pl.id
             LEFT JOIN teams t ON pl.team_id = t.id
             WHERE pp.prediction_id = $1
             ORDER BY pp.goal_prob DESC`,
            [predictions[0].id]
          )
        : [];

      return NextResponse.json({ prediction: predictions[0] || null, playerPredictions: playerPreds });
    }

    // All predictions with match info
    const predictions = await query(`
      SELECT p.*, m.match_date, m.competition, m.home_score, m.away_score, m.status,
        ht.name as home_team_name, at.name as away_team_name
      FROM predictions p
      JOIN matches m ON p.match_id = m.id
      LEFT JOIN teams ht ON m.home_team_id = ht.id
      LEFT JOIN teams at ON m.away_team_id = at.id
      ORDER BY m.match_date DESC
      LIMIT 50
    `);

    return NextResponse.json({ predictions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown";
    if (msg === "Unauthorized") return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
