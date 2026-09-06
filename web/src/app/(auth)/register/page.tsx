"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { AuthShell } from "@/components/AuthShell";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const fields = [
    { id: "reg-name", label: "Name", type: "text", value: name, setter: setName, placeholder: "Your name" },
    { id: "reg-email", label: "Email", type: "email", value: email, setter: setEmail, placeholder: "you@example.com" },
    { id: "reg-password", label: "Password", type: "password", value: password, setter: setPassword, placeholder: "Min 6 characters" },
  ] as const;

  return (
    <AuthShell
      photo="/img/rm-team.jpg"
      photoAlt="Real Madrid team line-up ready before a night match"
      badge="First Read, Free"
      headline={<>FIRST READ,<br />FREE<span className="text-ember">.</span></>}
      sub="Create your account and your first prediction costs nothing. See the numbers, the confidence band and the reasoning before you decide."
      stat={{ value: "1,527", label: "Matches fitted" }}
    >
      <div className="crop-marks relative rounded-2xl border border-chalk/10 bg-panel shadow-[0_30px_80px_-40px_rgba(11,15,12,0.35)]">
        {/* header */}
        <div className="border-b border-chalk/10 px-8 pb-6 pt-8">
          <span className="mb-5 block font-label text-[10px] font-bold uppercase tracking-[0.28em] text-ember">Join the Terminal</span>
          <h1 className="font-display text-5xl tracking-tight text-chalk">
            REGISTER<span className="text-ember">.</span>
          </h1>
          <p className="mt-2 text-sm text-stale">Create your account to get started.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-8 py-7" noValidate>
          {error && (
            <div className="flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger2">
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {fields.map((f) => (
            <div key={f.id}>
              <label htmlFor={f.id} className="mb-2 block font-label text-[11px] font-bold uppercase tracking-widest text-stale">
                {f.label}
              </label>
              <input
                id={f.id}
                type={f.type}
                value={f.value}
                onChange={(e) => f.setter(e.target.value)}
                placeholder={f.placeholder}
                required
                minLength={f.type === "password" ? 6 : undefined}
                className="w-full text-sm"
              />
            </div>
          ))}

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
                Creating account...
              </span>
            ) : (
              "Create Account →"
            )}
          </button>
        </form>

        <div className="border-t border-chalk/10 px-8 py-5 text-center text-sm text-stale">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-ember transition-colors duration-200 hover:text-flame">
            Sign in
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}