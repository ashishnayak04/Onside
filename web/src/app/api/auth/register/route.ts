import { NextRequest, NextResponse } from "next/server";
import { signToken, hashPassword } from "@/lib/auth";
import { query } from "@/lib/db";
import { getUserByEmail } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "Name, email and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    const password_hash = await hashPassword(password);
    const result = await query<{ id: string }>(
      "INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'user') RETURNING id",
      [email, password_hash, name]
    );

    const userId = result[0].id;
    const token = signToken({ id: userId, email, name, role: "user" });

    const response = NextResponse.json({
      user: { id: userId, email, name, role: "user" },
    });

    response.cookies.set("onside_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
