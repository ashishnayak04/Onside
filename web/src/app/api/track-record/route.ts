import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = (page - 1) * limit;

    const records = await query(`
      SELECT tr.*, 
        ht.name as home_team_name, at.name as away_team_name,
        p.predicted_home_score, p.predicted_away_score
      FROM track_record tr
      JOIN matches m ON tr.match_id = m.id
      LEFT JOIN teams ht ON m.home_team_id = ht.id
      LEFT JOIN teams at ON m.away_team_id = at.id
      JOIN predictions p ON tr.prediction_id = p.id
      ORDER BY m.match_date DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const total = await query<{ count: string }>("SELECT COUNT(*) as count FROM track_record");

    const stats = await queryOne<{
      total_predictions: string;
      correct_predictions: string;
      accuracy: number;
    }>(`
      SELECT 
        COUNT(*) as total_predictions,
        COUNT(*) FILTER (WHERE was_correct = true) as correct_predictions,
        ROUND(COUNT(*) FILTER (WHERE was_correct = true)::decimal / NULLIF(COUNT(*), 0), 4) as accuracy
      FROM track_record
    `);

    return NextResponse.json({
      records,
      stats: stats || { total_predictions: "0", correct_predictions: "0", accuracy: 0 },
      pagination: {
        page,
        limit,
        total: parseInt(total[0]?.count || "0", 10),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown";
    if (msg === "Unauthorized") return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
