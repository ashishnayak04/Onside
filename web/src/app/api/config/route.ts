import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const configs = await query(
      "SELECT key, value, category, description FROM system_config ORDER BY category, key"
    );
    return NextResponse.json({ configs });
  } catch {
    return NextResponse.json({ configs: [] });
  }
}
