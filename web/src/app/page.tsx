"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

/* ================================================================== */
/*  DATA — mirrors Onside's real output format                         */
/* ================================================================== */

type Match = {
  comp: string;
  tag: string;
  season: string;
  home: string;
  homeCode: string;
  away: string;
  awayCode: string;
  date: string;
  homeWin: number;
  draw: number;
  awayWin: number;
  hs: number;
  as: number;
  conf: "HIGH" | "MEDIUM" | "LOW";
  why: string[];
};

const MATCHES: Match[] = [
  {
    comp: "La Liga",
    tag: "Matchday 10 · El Sadar",
    season: "2026/27",
    home: "Osasuna",
    homeCode: "OSA",
    away: "Valencia",
    awayCode: "VAL",
    date: "Sun 30 May · 21:00 CET",
    homeWin: 45.0,
    draw: 26.3,
    awayWin: 28.6,
    hs: 1.44,
    as: 1.09,
    conf: "MEDIUM",
    why: [
      "Osasuna have won 5 of their last 7 at El Sadar, home xG running +0.35 above league baseline.",
      "Valencia's away xG-against has drifted with two starters out — our model reads them under-strength on the road.",
      "Last 4 meetings finished within one goal; that narrow band is what props up the 26% draw.",
    ],
  },
  {
    comp: "La Liga",
    tag: "Matchday 12 · Spotify Camp Nou",
    season: "2026/27",
    home: "FC Barcelona",
    homeCode: "BAR",
    away: "Athletic Club",
    awayCode: "ATH",
    date: "Sat 12 Sep · 21:00 CET",
    homeWin: 68.0,
    draw: 18.0,
    awayWin: 14.0,
    hs: 1.92,
    as: 0.71,
    conf: "HIGH",
    why: [
      "Barca create 2.3xG per home match — the single strongest attacking profile in our La Liga fit.",
      "Athletic travel with their best defender suspended and a poor away xG-differential.",
      "High-mu home side; model allocates slim 18% to the draw, 14% to the away upset.",
    ],
  },
  {
    comp: "UEFA Champions League",
    tag: "League Phase R2 · Bernabéu",
    season: "2025/26",
    home: "Real Madrid",
    homeCode: "RMA",
    away: "Manchester City",
    awayCode: "MCI",
    date: "Wed 30 Sep · 21:00 CET",
    homeWin: 41.0,
    draw: 27.0,
    awayWin: 32.0,
    hs: 1.31,
    as: 0.98,
    conf: "LOW",
    why: [
      "Two elite xG sides nearly cancel out — our SOT layer reads this as the tightest of the three.",
      "Madrid's knockout-stage home record is excellent, but City's away xG is top-3 in the sample.",
      "Close mu values push draw probability up to 27%; genuine coin-flip territory, hence LOW confidence.",
    ],
  },
];

const METHOD = [
  { tag: "FORM", label: "Current form", value: "Last 6 · xWpts weighted", note: "recency ξ = 0.004" },
  { tag: "xG", label: "Expected goals", value: "xG for / against, split home & away", note: "mu · λ" },
  { tag: "OUT", label: "Availability", value: "Injuries & suspensions", note: "squad delta" },
  { tag: "H2H", label: "Head-to-head", value: "Historical matchup band", note: "tight-score lean" },
];

const TICKER = [
  "MCI 2 - 1 ARS",
  "REAL 3 - 1 SEV",
  "BAR 2 - 0 VLL",
  "ATM 1 - 1 SOC",
  "OSA 2 - 1 VIL",
];

/* ================================================================== */
/*  SMALL HELPERS                                                      */
/* ================================================================== */

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

function useReveal({ delay = 0 }: { delay?: number } = {}) {
  const reduce = useReducedMotion();
  return {
    initial: reduce ? false : { opacity: 0, y: 28 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-70px" },
    transition: { duration: 0.7, delay, ease: EASE },
  } as const;
}

function SectionTag({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-1 font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a3e635]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#a3e635]" />
      {children}
    </div>
  );
}

/* ================================================================== */
/*  PITCH — background field with mowing stripes + markings            */
/* ================================================================== */

function Pitch() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* base + mowing stripes */}
      <div className="absolute inset-0" style={{
        background:
          "linear-gradient(180deg, #08120c 0%, #0c1f13 30%, #0f2a19 55%, #0c1f13 80%, #08120c 100%)",
      }} />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.022) 0 180px, rgba(0,0,0,0.05) 180px 360px)",
        }}
      />
      {/* floodlight glow */}
      <div className="absolute -top-40 left-1/2 h-[520px] w-[1100px] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(163,230,53,0.16), transparent 70%)" }} />
      {/* center circle + halfway line */}
      <div className="absolute left-1/2 top-1/2 h-[520px] w-[90px] -translate-x-1/2 -translate-y-1/2 border-y border-white/10" />
      <div className="absolute left-1/2 top-1/2 aspect-square h-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
      <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20" />
      {/* penalty boxes (hint, RHS) */}
      <div className="absolute right-0 top-1/2 h-[280px] w-[120px] -translate-y-1/2 border-y border-l border-white/10" />
      <div className="absolute right-0 top-[calc(50%+0px)] h-24 w-9 -translate-y-1/2 border-y border-l border-white/10" />
      {/* vignette */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 20%, transparent 40%, rgba(4,9,6,0.6) 100%)" }} />
    </div>
  );
}

/* ================================================================== */
/*  SIGNATURE — Live Broadcast Match Centre                            */
/* ================================================================== */

function Countdown({ dateLabel }: { dateLabel: string }) {
  const reduce = useReducedMotion();
  // simplified: show a ticking "kickoff in" using a static fixture feel (dates are far ahead)
  return (
    <span className="flex items-center gap-1.5 font-display text-[13px] font-semibold uppercase tracking-wider text-[#a3e635]">
      <motion.span
        animate={reduce ? undefined : { opacity: [1, 0.3, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className="h-1.5 w-1.5 rounded-full bg-[#a3e635]"
      />
      {dateLabel}
    </span>
  );
}

function WinDrawLoss({ home, draw, away }: { home: number; draw: number; away: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-9 overflow-hidden rounded-lg border border-white/10">
      {[
        { v: home, c: "bg-[#22c55e]" },
        { v: draw, c: "bg-[#64748b]" },
        { v: away, c: "bg-[#f59e0b]" },
      ].map((s, i) => (
        <motion.div
          key={i}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${s.v}%` }}
          transition={{ duration: 0.9, delay: 0.5 + i * 0.12, ease: EASE }}
          className={`${s.c} relative`}
        >
          <motion.span
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 + i * 0.12 }}
            className="absolute inset-0 flex items-center justify-center font-display text-[11px] font-bold text-black/80"
          >
            {i === 0 ? "H" : i === 1 ? "D" : "A"}
          </motion.span>
        </motion.div>
      ))}
    </div>
  );
}

function TeamScore({ code, score, home, accent }: { code: string; score: string; home?: boolean; accent: boolean }) {
  return (
    <div className={`flex flex-1 flex-col ${home ? "items-start" : "items-end"}`}>
      <span className="font-display text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">{code}</span>
      <motion.span
        initial={false}
        animate={{ scale: [1, 1.35, 1] }}
        transition={{ duration: 0.45, delay: 1.15 }}
        className={`font-display text-5xl font-bold leading-none sm:text-6xl ${accent ? "text-[#a3e635]" : "text-white/85"}`}
      >
        {score}
      </motion.span>
    </div>
  );
}

function MatchCentre() {
  const [idx, setIdx] = useState(0);
  const reduce = useReducedMotion();
  const m = MATCHES[idx];

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % MATCHES.length), 7000);
    return () => clearInterval(t);
  }, []);

  const confChip =
    m.conf === "HIGH"
      ? "border-[#22c55e]/40 bg-[#22c55e]/15 text-[#a3e635]"
      : m.conf === "MEDIUM"
      ? "border-[#f59e0b]/40 bg-[#f59e0b]/15 text-[#fbbf24]"
      : "border-[#38bdf8]/40 bg-[#38bdf8]/15 text-[#7dd3fc]";

  return (
    <div className="relative w-full max-w-md">
      {/* amber glow behind */}
      <div aria-hidden className="absolute -inset-6 rounded-[2.2rem]"
        style={{ background: "radial-gradient(closest-side, rgba(163,230,53,0.22), transparent 75%)", filter: "blur(24px)" }} />

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, delay: 0.15, ease: EASE }}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b1a10]/95 to-[#08120c]/95 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur"
      >
        {/* top ticker strip */}
        <div className="flex items-center justify-between border-b border-white/10 bg-black/30 px-4 py-2">
          <span className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-[#ff4d4d]">
            <motion.span animate={reduce ? undefined : { opacity: [1, 0.2, 1] }} transition={{ duration: 1.2, repeat: Infinity }} className="h-1.5 w-1.5 rounded-full bg-[#ff4d4d]" />
            LIVE
          </span>
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
            {m.comp} · {m.tag}
          </span>
          <Countdown dateLabel={m.season} />
        </div>

        <div className="p-6">
          {/* scoreboard */}
          <div className="flex items-center justify-between gap-2">
            <TeamScore code={m.homeCode} score={m.hs.toFixed(2)} home accent={m.homeWin > m.awayWin} />
            <div className="flex flex-col items-center px-2">
              <span className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">predicted</span>
              <span className="font-display text-xl font-bold text-white/25">:</span>
              <span className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">score</span>
            </div>
            <TeamScore code={m.awayCode} score={m.as.toFixed(2)} accent={m.awayWin > m.homeWin} />
          </div>

          {/* full names */}
          <div className="mt-2 flex items-center justify-between text-sm font-medium text-white/70">
            <span>{m.home}</span>
            <span className="text-white/35">vs</span>
            <span>{m.away}</span>
          </div>

          {/* W/D/L bar */}
          <div className="mt-6">
            <WinDrawLoss home={m.homeWin} draw={m.draw} away={m.awayWin} />
            <div className="mt-1.5 flex justify-between px-1 font-display text-[10px] font-semibold uppercase tracking-wider text-white/50">
              <span className="text-[#22c55e]">{m.homeWin.toFixed(0)}% home</span>
              <span className="text-[#a1a1aa]">{m.draw.toFixed(0)}% draw</span>
              <span className="text-[#f59e0b]">{m.awayWin.toFixed(0)}% away</span>
            </div>
          </div>

          {/* confidence */}
          <div className="mt-4 flex items-center justify-between">
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Confidence</span>
            <span className={`rounded-md border px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wider ${confChip}`}>
              {m.conf}
            </span>
          </div>

          {/* why */}
          <motion.div key={idx} className="mt-5 space-y-2.5 rounded-xl border border-white/10 bg-black/20 p-4"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}>
            <p className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-[#a3e635]">
              Why we think so
            </p>
            {m.why.map((line, i) => (
              <div key={i} className="flex gap-2 text-[12.5px] leading-snug text-white/75">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#a3e635]/70" />
                {line}
              </div>
            ))}
          </motion.div>

          {/* nav dots */}
          <div className="mt-5 flex items-center justify-center gap-1.5">
            {MATCHES.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} aria-label={`Show match ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-5 bg-[#a3e635]" : "w-1.5 bg-white/20 hover:bg-white/40"}`} />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ================================================================== */
/*  NAV / FOOTER                                                       */
/* ================================================================== */

function Nav() {
  return (
    <header className="relative z-20 flex items-center justify-between px-6 py-5">
      <Link href="/" className="flex items-center gap-2">
        <span className="relative flex h-4 w-4">
          <span className="absolute inset-0 rotate-45 rounded-[3px] bg-[#a3e635]" />
          <span className="absolute inset-[5px] rounded-full bg-[#08120c]" />
        </span>
        <span className="font-display text-xl font-bold tracking-tight text-white">ONSIDE</span>
      </Link>
      <nav className="hidden items-center gap-7 font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-white/60 md:flex">
        <a href="#how" className="transition hover:text-[#a3e635]">The method</a>
        <a href="#track" className="transition hover:text-[#a3e635]">Track record</a>
        <a href="#comps" className="transition hover:text-[#a3e635]">Competitions</a>
      </nav>
      <Link href="/login" className="rounded-lg border border-[#a3e635]/40 bg-[#a3e635]/10 px-4 py-2 font-display text-[13px] font-bold uppercase tracking-wider text-[#a3e635] transition hover:bg-[#a3e635] hover:text-[#08120c]">
        Sign in
      </Link>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#08120c]/70 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
        <span className="flex items-center gap-2 font-display text-sm font-bold text-white">
          <span className="h-3 w-3 rotate-45 rounded-[2px] bg-[#a3e635]" /> ONSIDE
        </span>
        <p className="text-xs text-white/45">Probability, not certainty. La Liga + UEFA Champions League.</p>
        <span className="font-mono text-[10px] uppercase tracking-widest text-white/35">© {new Date().getFullYear()} Onside</span>
      </div>
    </footer>
  );
}

/* ================================================================== */
/*  PAGE                                                               */
/* ================================================================== */

export default function Landing() {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-[#08120c] text-white">
      <Pitch />
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <Nav />

        {/* ---------------- HERO ---------------- */}
        <section className="grid items-center gap-12 pb-28 pt-10 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div>
            <motion.div {...useReveal()}>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-1 font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a3e635]">
                Dixon-Coles + SOT · La Liga &amp; UCL
              </div>
            </motion.div>

            <motion.h1 {...useReveal({ delay: 0.08 })}
              className="font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
              This isn&apos;t a guess.
              <br />
              <span className="text-transparent" style={{ WebkitTextStroke: "1.5px #a3e635" }}>It&apos;s a read.</span>
            </motion.h1>

            <motion.p {...useReveal({ delay: 0.16 })}
              className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              We feed real form, expected goals, injuries and head-to-head history into a model we&apos;ve
              backtested against bookmaker odds. Then we show you the exact reasoning behind every number.
            </motion.p>

            <motion.div {...useReveal({ delay: 0.24 })} className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/login" className="group inline-flex items-center gap-2 rounded-xl bg-[#a3e635] px-7 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-[#08120c] transition hover:bg-[#bef264]">
                Get my first prediction
                <span className="transition group-hover:translate-x-1">→</span>
              </Link>
              <Link href="#how" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-7 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-white/80 transition hover:border-[#a3e635]/50 hover:text-[#a3e635]">
                See the method
              </Link>
            </motion.div>

            <motion.div {...useReveal({ delay: 0.32 })} className="mt-8 flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
              Every prediction ships with a confidence band — we don&apos;t pretend to be certain.
            </motion.div>
          </div>

          <MatchCentre />
        </section>

        {/* ---------------- TICKER ---------------- */}
        <motion.div {...useReveal()} className="-mx-6 mb-6 overflow-hidden border-y border-white/10 bg-black/25 py-2.5">
          <div className="flex w-max animate-[ticker_28s_linear_infinite] items-center gap-10 pr-10">
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={i} className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-white/45">{t}</span>
            ))}
          </div>
        </motion.div>

        {/* ---------------- HOW IT THINKS ---------------- */}
        <section id="how" className="scroll-mt-24 py-24">
          <motion.div {...useReveal()}>
            <SectionTag>The method</SectionTag>
            <h2 className="mt-4 max-w-2xl font-display text-4xl font-bold uppercase leading-tight tracking-tight sm:text-5xl">
              Why this prediction?<br /><span className="text-[#a3e635]">We can show you.</span>
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-white/65">
              Transparency is the product. Every number traces back to inputs you can inspect — no black box.
            </p>
          </motion.div>

          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {METHOD.map((row, i) => (
              <motion.div key={row.tag} {...useReveal({ delay: 0.08 + i * 0.07 })}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur transition hover:border-[#a3e635]/40 hover:bg-[#a3e635]/[0.05]">
                <div className="mb-4 flex items-center justify-between">
                  <span className="font-display text-sm font-bold uppercase tracking-[0.2em] text-[#a3e635]">{row.tag}</span>
                  <span className="h-2 w-2 rounded-sm border border-[#a3e635]/50" />
                </div>
                <p className="text-lg font-semibold text-white">{row.label}</p>
                <p className="mt-1 text-sm text-white/55">{row.value}</p>
                {row.note && <p className="mt-3 font-mono text-[11px] text-[#a3e635]/70">{row.note}</p>}
              </motion.div>
            ))}
          </div>

          <motion.div {...useReveal({ delay: 0.1 })} className="mt-6 rounded-2xl border border-[#22c55e]/30 bg-gradient-to-r from-[#22c55e]/10 to-transparent px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-base font-bold uppercase tracking-wide">Dixon-Coles + Poisson</p>
                <p className="text-sm text-white/60">Scoring model calibrated on 1,527 real matches — then blended with a recency-aware SOT layer.</p>
              </div>
              <span className="rounded-lg bg-[#a3e635] px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-[#08120c]">fit → predict</span>
            </div>
          </motion.div>
        </section>

        {/* ---------------- TRACK RECORD ---------------- */}
        <section id="track" className="scroll-mt-24 border-t border-white/10 py-24">
          <motion.div {...useReveal()}>
            <SectionTag>The receipts</SectionTag>
            <h2 className="mt-4 max-w-2xl font-display text-4xl font-bold uppercase leading-tight tracking-tight sm:text-5xl">
              We show accuracy, not just confidence.
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-white/65">
              A confidence score is worthless if you never check it against reality. We backtest against
              bookmaker closing odds — and publish the result, win or lose.
            </p>
          </motion.div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { v: "50.3%", l: "Calibration accuracy", d: "vs the spread of our own probabilities", c: "text-[#a3e635]" },
              { v: "1.022", l: "Log-loss", d: "lower is better — stable out-of-sample", c: "text-white" },
              { v: "52.4%", l: "Benchmark · bookies", d: "the house is the bar we chase", c: "text-[#f59e0b]" },
              { v: "1527", l: "Matches fitted", d: "Dixon-Coles + SOT, blend w=0.4", c: "text-white" },
            ].map((s, i) => (
              <motion.div key={s.l} {...useReveal({ delay: 0.08 + i * 0.07 })}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <p className={`font-display text-5xl font-bold ${s.c}`}>{s.v}</p>
                <p className="mt-2 font-display text-sm font-semibold uppercase tracking-wide text-white/80">{s.l}</p>
                <p className="mt-1 text-sm text-white/50">{s.d}</p>
              </motion.div>
            ))}
          </div>

          <motion.p {...useReveal({ delay: 0.12 })} className="mt-8 max-w-3xl text-sm leading-relaxed text-white/50">
            The honest framing: bookmakers remain the bar, and beating them is hard — which is exactly why we
            publish the comparison instead of hiding it. Our edge is transparency and discipline, not certainty.
          </motion.p>
        </section>

        {/* ---------------- COMPETITIONS ---------------- */}
        <section id="comps" className="scroll-mt-24 border-t border-white/10 py-24">
          <motion.div {...useReveal()}>
            <SectionTag>Where we live</SectionTag>
            <h2 className="mt-4 max-w-2xl font-display text-4xl font-bold uppercase leading-tight tracking-tight sm:text-5xl">
              Two competitions. Tracked obsessively.
            </h2>
          </motion.div>

          <div className="mt-14 grid gap-6 md:grid-cols-2">
            {[
              { c: "La Liga", d: "la-liga", tag: "Spain · Top flight", desc: "Every matchday, every club — form curves, xG trajectories and injury deltas tracked all season.", n: "380 fixtures · 2026/27", hue: "#22c55e" },
              { c: "UEFA Champions League", d: "ucl", tag: "Europe · Champions", desc: "The knockout-stage moments where one read separates a calm punt from a panic bet.", n: "League phase → final", hue: "#38bdf8" },
            ].map((s, i) => (
              <motion.div key={s.c} {...useReveal({ delay: 0.08 + i * 0.1 })}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-8"
                onMouseEnter={() => {}}>
                <div aria-hidden className="absolute inset-0 opacity-50"
                  style={{ background: `radial-gradient(120% 120% at 0% 0%, ${s.hue}22, transparent 55%)` }} />
                <div className="relative">
                  <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">{s.tag}</p>
                  <h3 className="mt-3 font-display text-3xl font-bold uppercase tracking-tight">{s.c}</h3>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-white/60">{s.desc}</p>
                  <p className="mt-5 font-mono text-[11px] tracking-widest" style={{ color: s.hue }}>{s.n}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ---------------- CTA ---------------- */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 px-8 py-20 text-center">
          <div aria-hidden className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(163,230,53,0.10), rgba(8,18,12,0) 70%)" }} />
          <motion.div {...useReveal()} className="relative">
            <h2 className="mx-auto max-w-2xl font-display text-4xl font-bold uppercase leading-tight tracking-tight sm:text-5xl">
              See the read before you place anything.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/65">
              Your first prediction is free. We&apos;ll show you the numbers, the confidence band and the
              reasoning — then you decide.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
              <Link href="/login" className="inline-flex items-center gap-2 rounded-xl bg-[#a3e635] px-8 py-4 font-display text-sm font-bold uppercase tracking-wider text-[#08120c] transition hover:bg-[#bef264]">
                Get my first prediction <span>→</span>
              </Link>
              <Link href="#how" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-8 py-4 font-display text-sm font-bold uppercase tracking-wider text-white/80 transition hover:border-[#a3e635]/50 hover:text-[#a3e635]">
                Revisit the method
              </Link>
            </div>
          </motion.div>
        </section>

        <Footer />
        <div className="h-16" />
      </div>
    </main>
  );
}
