import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export async function GET() {
  try {
    const scored = await queryOne<{ n: string; hits: string }>(`
      SELECT count(*) AS n, count(*) FILTER (WHERE was_correct) AS hits
      FROM track_record
      WHERE was_correct IS NOT NULL
    `);

    const brier = await queryOne<{ brier: string | null }>(`
      SELECT avg(
        power(home_win_prob - (actual_outcome = 'home_win')::int, 2)
        + power(draw_prob - (actual_outcome = 'draw')::int, 2)
        + power(away_win_prob - (actual_outcome = 'away_win')::int, 2)
      ) AS brier
      FROM track_record
      WHERE home_win_prob IS NOT NULL AND actual_outcome IS NOT NULL
    `);

    const finished = await queryOne<{ n: string }>(
      "SELECT count(*) AS n FROM matches WHERE status = 'finished'"
    );

    const comps = await queryOne<{ n: string }>(
      "SELECT count(DISTINCT competition) AS n FROM matches"
    );

    const fresh = await queryOne<{ t: string | null }>(
      "SELECT max(created_at) AS t FROM predictions"
    );

    const n = Number(scored?.n ?? 0);
    const hits = Number(scored?.hits ?? 0);

    return NextResponse.json({
      matches_tracked: n,
      top_pick_hits: hits,
      top_pick_rate: n > 0 ? Math.round((hits / n) * 1000) / 10 : null,
      brier: brier?.brier != null ? Math.round(Number(brier.brier) * 100) / 100 : null,
      finished_matches: Number(finished?.n ?? 0),
      competitions: Number(comps?.n ?? 0),
      updated_at: fresh?.t ?? null,
      generated_at: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}