import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export async function GET() {
  try {
    await requireAdmin();
    const users = await query(
      "SELECT id, email, name, role, is_active, created_at, updated_at FROM users ORDER BY created_at DESC"
    );
    return NextResponse.json({ users });
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
    const { user_id, role, is_active } = await request.json();

    if (!user_id) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    const targetUser = await queryOne("SELECT * FROM users WHERE id = $1", [user_id]);
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent self-deactivation
    if (user_id === admin.id && is_active === false) {
      return NextResponse.json({ error: "Cannot deactivate yourself" }, { status: 400 });
    }

    if (role !== undefined) {
      await query("UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2", [role, user_id]);
    }

    if (is_active !== undefined) {
      await query("UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2", [is_active, user_id]);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown";
    if (msg === "Unauthorized") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "Forbidden") return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
