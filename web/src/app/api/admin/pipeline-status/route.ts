import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { queryOne } from "@/lib/db";

export async function GET() {
  try {
    await requireAdmin();

    const latestRun = await queryOne(`
      SELECT status, model_version, fixtures_processed, predictions_written,
             track_record_synced, error, started_at, finished_at
      FROM pipeline_runs
      ORDER BY started_at DESC
      LIMIT 1
    `);

    const totalRuns = await queryOne("SELECT count(*) AS n FROM pipeline_runs");
    const modelConfig = await queryOne(
      "SELECT value FROM system_config WHERE key = 'prediction_model'"
    );

    return NextResponse.json({
      latestRun,
      totalRuns: Number(totalRuns?.n ?? 0),
      configuredModel: modelConfig?.value ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown";
    if (msg === "Unauthorized") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "Forbidden") return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}