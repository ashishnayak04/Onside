import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Registration is disabled. Accounts are provisioned by an administrator." },
    { status: 403 }
  );
}