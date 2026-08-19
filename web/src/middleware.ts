import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth-token";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("onside_token")?.value;
  const user = token ? verifyToken(token) : null;

  // Public routes
  const publicRoutes = ["/login", "/register", "/api/auth/login", "/api/auth/register"];
  if (publicRoutes.includes(pathname)) {
    if (user) {
      return NextResponse.redirect(new URL(user.role === "super_admin" ? "/admin" : "/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // Root redirect
  if (pathname === "/") {
    if (!user) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.redirect(new URL(user.role === "super_admin" ? "/admin" : "/dashboard", request.url));
  }

  // Auth required for everything else
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Admin routes protection
  if (pathname.startsWith("/admin") && user.role !== "super_admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // User cannot access admin API routes
  if (pathname.startsWith("/api/admin") && user.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
