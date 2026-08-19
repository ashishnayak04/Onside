import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export async function GET() {
  try {
    await requireAdmin();
    const configs = await query(
      "SELECT * FROM system_config ORDER BY category, key"
    );
    return NextResponse.json({ configs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown";
    if (msg === "Unauthorized") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "Forbidden") return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const { key, value } = await request.json();

    if (!key || value === undefined) {
      return NextResponse.json({ error: "key and value are required" }, { status: 400 });
    }

    const existing = await queryOne("SELECT id FROM system_config WHERE key = $1", [key]);
    if (!existing) {
      return NextResponse.json({ error: "Config key not found" }, { status: 404 });
    }

    await query(
      "UPDATE system_config SET value = $1, updated_by = $2, updated_at = NOW() WHERE key = $3",
      [value, admin.id, key]
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown";
    if (msg === "Unauthorized") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "Forbidden") return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const { key, value, category, description, is_secret } = await request.json();

    if (!key || value === undefined || !category) {
      return NextResponse.json(
        { error: "key, value, and category are required" },
        { status: 400 }
      );
    }

    const existing = await queryOne("SELECT id FROM system_config WHERE key = $1", [key]);
    if (existing) {
      return NextResponse.json({ error: "Config key already exists" }, { status: 409 });
    }

    await query(
      "INSERT INTO system_config (key, value, category, description, is_secret, updated_by) VALUES ($1, $2, $3, $4, $5, $6)",
      [key, value, category, description || null, is_secret || false, admin.id]
    );

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown";
    if (msg === "Unauthorized") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "Forbidden") return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin();
    const { key } = await request.json();

    if (!key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    await query("DELETE FROM system_config WHERE key = $1", [key]);
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown";
    if (msg === "Unauthorized") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "Forbidden") return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
