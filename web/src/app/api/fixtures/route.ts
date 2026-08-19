import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  try {
    await requireAuth();

    const matches = await query(`
      SELECT m.*, 
        ht.name as home_team_name, ht.short_name as home_short,
        at.name as away_team_name, at.short_name as away_short
      FROM matches m
      LEFT JOIN teams ht ON m.home_team_id = ht.id
      LEFT JOIN teams at ON m.away_team_id = at.id
      WHERE m.status = 'scheduled'
      ORDER BY m.match_date ASC
      LIMIT 50
    `);

    return NextResponse.json({ matches });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown";
    if (msg === "Unauthorized") return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
