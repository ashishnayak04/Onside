"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { AuthShell } from "@/components/AuthShell";

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
    <AuthShell
      photo="/img/rm-vs-bayern.jpg"
      photoAlt="Real Madrid players in action against Bayern Munich"
      badge="Matchday Ready"
      headline={<>YOUR READ,<br />LIVE<span className="text-ember">.</span></>}
      sub="Real form, expected goals, injuries and H2H — a model backtested on 1,527 matches, with every number showing its reasoning."
      stat={{ value: "50.3%", label: "Calibration" }}
    >
      <div className="crop-marks relative rounded-2xl border border-chalk/10 bg-panel shadow-[0_30px_80px_-40px_rgba(11,15,12,0.35)]">
        {/* header */}
        <div className="border-b border-chalk/10 px-8 pb-6 pt-8">
          <span className="mb-5 block font-label text-[10px] font-bold uppercase tracking-[0.28em] text-ember">Player Terminal</span>
          <h1 className="font-display text-5xl tracking-tight text-chalk">
            SIGN IN<span className="text-ember">.</span>
          </h1>
          <p className="mt-2 text-sm text-stale">Enter the matchday read — your dashboard is waiting.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-8 py-7" noValidate>
          {error && (
            <div className="flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger2">
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <div>
            <label htmlFor="login-email" className="mb-2 block font-label text-[11px] font-bold uppercase tracking-widest text-stale">
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
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-2 block font-label text-[11px] font-bold uppercase tracking-widest text-stale">
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
                className="w-full pr-12 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-stale transition-colors duration-200 hover:text-chalk"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-ember py-3.5 font-label text-[13px] font-bold uppercase tracking-widest text-[#221A00] transition-all duration-300 hover:bg-flame hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
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

        <div className="border-t border-chalk/10 px-8 py-5 text-center text-sm text-stale">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-semibold text-ember transition-colors duration-200 hover:text-flame">
            Create one
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}