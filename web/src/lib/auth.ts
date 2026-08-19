import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { queryOne } from "./db";
import { signToken, verifyToken, type UserPayload } from "./auth-token";

export type { UserPayload };

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: "super_admin" | "user";
  password_hash: string;
  is_active: boolean;
  created_at: string;
}

export { signToken, verifyToken };

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function getCurrentUser(): Promise<UserPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("onside_token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireAuth(): Promise<UserPayload> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireAdmin(): Promise<UserPayload> {
  const user = await requireAuth();
  if (user.role !== "super_admin") {
    throw new Error("Forbidden");
  }
  return user;
}

export function getUserByEmail(email: string) {
  return queryOne<UserRow>("SELECT * FROM users WHERE email = $1", [email]);
}
