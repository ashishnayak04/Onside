"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      router.push(data.user.role === "super_admin" ? "/admin" : "/dashboard");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-2xl"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Header strip */}
      <div
        className="px-8 pt-8 pb-6"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.25)" }}
          >
            <svg className="w-5 h-5" fill="none" stroke="#4ade80" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1
              className="text-2xl text-white tracking-widest"
              style={{ fontFamily: "var(--font-headline)", letterSpacing: "0.15em" }}
            >
              ONSIDE
            </h1>
          </div>
        </div>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
          Sign in to your predictions dashboard
        </p>
      </div>

      <div className="px-8 py-7">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div
              className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm"
              style={{
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "#f87171",
              }}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="login-email"
              className="block text-xs font-semibold mb-2 uppercase tracking-wider"
              style={{ color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-label)" }}
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full text-sm"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "0.75rem",
                padding: "0.75rem 1rem",
                color: "white",
                outline: "none",
              }}
              onFocus={(e) => {
                (e.target as HTMLInputElement).style.borderColor = "#4ade80";
                (e.target as HTMLInputElement).style.boxShadow = "0 0 0 3px rgba(74,222,128,0.10)";
              }}
              onBlur={(e) => {
                (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.12)";
                (e.target as HTMLInputElement).style.boxShadow = "";
              }}
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold mb-2 uppercase tracking-wider"
              style={{ color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-label)" }}
            >
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full text-sm pr-12"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "0.75rem",
                  padding: "0.75rem 1rem",
                  color: "white",
                  outline: "none",
                }}
                onFocus={(e) => {
                  (e.target as HTMLInputElement).style.borderColor = "#4ade80";
                  (e.target as HTMLInputElement).style.boxShadow = "0 0 0 3px rgba(74,222,128,0.10)";
                }}
                onBlur={(e) => {
                  (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.12)";
                  (e.target as HTMLInputElement).style.boxShadow = "";
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 disabled:opacity-60 mt-2"
            style={{
              background: loading ? "rgba(74,222,128,0.6)" : "linear-gradient(135deg, #22c55e, #16a34a)",
              color: "white",
              fontFamily: "var(--font-label)",
              letterSpacing: "0.06em",
              boxShadow: loading ? "none" : "0 4px 20px rgba(34,197,94,0.35)",
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in...
              </span>
            ) : (
              "Sign In →"
            )}
          </button>
        </form>

        <div
          className="mt-6 pt-5 text-center text-sm"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }}
        >
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-semibold transition-colors" style={{ color: "#4ade80" }}>
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
}
