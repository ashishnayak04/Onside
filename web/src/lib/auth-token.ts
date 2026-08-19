import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "onside-jwt-secret-change-in-production";

export interface UserPayload {
  id: string;
  email: string;
  name: string;
  role: "super_admin" | "user";
}

export function signToken(payload: UserPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): UserPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserPayload;
  } catch {
    return null;
  }
}
