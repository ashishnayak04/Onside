"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

  const inputStyle = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "0.75rem",
    padding: "0.75rem 1rem",
    color: "white",
    outline: "none",
    width: "100%",
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "#4ade80";
    e.target.style.boxShadow = "0 0 0 3px rgba(74,222,128,0.10)";
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "rgba(255,255,255,0.12)";
    e.target.style.boxShadow = "";
  };

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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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
          Create your account to get started
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

          {[
            { id: "reg-name", label: "Name", type: "text", value: name, setter: setName, placeholder: "Your name" },
            { id: "reg-email", label: "Email", type: "email", value: email, setter: setEmail, placeholder: "you@example.com" },
            { id: "reg-password", label: "Password", type: "password", value: password, setter: setPassword, placeholder: "Min 6 characters" },
          ].map(({ id, label, type, value, setter, placeholder }) => (
            <div key={id}>
              <label
                htmlFor={id}
                className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                style={{ color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-label)" }}
              >
                {label}
              </label>
              <input
                id={id}
                type={type}
                value={value}
                onChange={(e) => setter(e.target.value)}
                placeholder={placeholder}
                required
                minLength={type === "password" ? 6 : undefined}
                style={inputStyle}
                className="text-sm"
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>
          ))}

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
                Creating account...
              </span>
            ) : (
              "Create Account →"
            )}
          </button>
        </form>

        <div
          className="mt-6 pt-5 text-center text-sm"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }}
        >
          Already have an account?{" "}
          <Link href="/login" className="font-semibold transition-colors" style={{ color: "#4ade80" }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
