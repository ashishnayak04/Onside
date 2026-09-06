"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  AnimatePresence,
} from "framer-motion";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { Brand } from "@/components/Brand";
import { PitchSVG } from "@/components/PitchSVG";
import { CountUp } from "@/components/CountUp";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/* ──────────────────────────────────────────────────────── */
/*  DATA                                                    */
/* ──────────────────────────────────────────────────────── */
const MATCHES = [
  {
    comp: "La Liga", tag: "MD 10 · El Sadar", season: "2026/27",
    home: "Osasuna", homeCode: "OSA",
    away: "Valencia", awayCode: "VAL",
    date: "Sun 30 Nov · 21:00 CET",
    homeWin: 45, draw: 27, awayWin: 28,
    hs: 1.44, as: 1.09,
    conf: "MEDIUM" as const,
    why: [
      "OSA won 5 of last 7 at El Sadar. Home xG +0.35 above baseline.",
      "VAL travel under-strength — two starters missing, xG-against drifting.",
      "Last 4 H2Hs within one goal. Tight band = 27% draw.",
    ],
  },
  {
    comp: "La Liga", tag: "MD 12 · Camp Nou", season: "2026/27",
    home: "FC Barcelona", homeCode: "BAR",
    away: "Athletic Club", awayCode: "ATH",
    date: "Sat 12 Oct · 21:00 CET",
    homeWin: 68, draw: 18, awayWin: 14,
    hs: 1.92, as: 0.71,
    conf: "HIGH" as const,
    why: [
      "Barça 2.3 xG/home — strongest attacking profile in our La Liga fit.",
      "ATH best CB suspended. Poor away xG-differential this season.",
      "High-mu home side. 14% upset probability — model is unambiguous.",
    ],
  },
  {
    comp: "UCL", tag: "LP R2 · Bernabéu", season: "2026/27",
    home: "Real Madrid", homeCode: "RMA",
    away: "Man City", awayCode: "MCI",
    date: "Wed 30 Sep · 21:00 CET",
    homeWin: 41, draw: 27, awayWin: 32,
    hs: 1.31, as: 0.98,
    conf: "LOW" as const,
    why: [
      "Two elite xG sides nearly cancel. Tightest fixture in the sample.",
      "Madrid KO home record is elite. City away xG is top-3 in dataset.",
      "27% draw reflects genuinely close mu values. Coin-flip territory.",
    ],
  },
];

const TICKER = [
  "BAR 5–1 VLL", "MCI 2–1 ARS", "REAL 3–1 SEV",
  "ATM 1–1 SOC", "OSA 2–1 VIL", "ATH 0–2 GIR",
  "CEL 1–1 ESP", "MAL 0–3 MAD", "GET 1–0 RAY",
];

const STATS = [
  { value: "50.3", suffix: "%", label: "Calibration Accuracy", desc: "vs spread of our own probabilities" },
  { value: "1.022", suffix: "", label: "Log-Loss Score", desc: "lower is better — stable out-of-sample" },
  { value: "52.4", suffix: "%", label: "Bookmaker Benchmark", desc: "the house — the bar we chase" },
  { value: "1527", suffix: "", label: "Matches Fitted", desc: "Dixon-Coles + SOT blend w=0.4" },
];

const CONF_STYLES = {
  HIGH:   { chip: "border-leaf/40 bg-leaf/12 text-leaf2", dot: "bg-leaf" },
  MEDIUM: { chip: "border-gold/40 bg-gold/12 text-gold", dot: "bg-gold" },
  LOW:    { chip: "border-danger/40 bg-danger/12 text-danger2", dot: "bg-danger" },
};

const METHOD_CARDS = [
  {
    tag: "01", label: "FORM", title: "Current Form",
    desc: "Last 6 matches · xWpts weighted", note: "recency ξ = 0.004",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    tag: "02", label: "xG", title: "Expected Goals",
    desc: "xG for/against · home & away split", note: "mu · λ (Dixon-Coles)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l3 3" />
      </svg>
    ),
  },
  {
    tag: "03", label: "OUT", title: "Availability",
    desc: "Injuries & suspensions tracked", note: "squad delta applied",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    tag: "04", label: "H2H", title: "Head-to-Head",
    desc: "Historical matchup band analysis", note: "tight-score lean",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
];

/* ──────────────────────────────────────────────────────── */
/*  SHARED ATOMS                                           */
/* ──────────────────────────────────────────────────────── */
function SectionHead({
  index, label, title, sub, className = "",
}: {
  index: string; label: string; title: ReactNode; sub?: string; className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-8 flex items-center gap-3">
        <span className="font-display text-[14px] tracking-[0.3em] text-ember">— {index}</span>
        <span className="h-px w-10 bg-chalk/20" />
        <span className="font-label text-[11px] font-bold uppercase tracking-[0.28em] text-stale">{label}</span>
      </div>
      <h2 className="font-display leading-[0.9] tracking-tight text-[clamp(44px,6.8vw,100px)] text-chalk">
        {title}
      </h2>
      {sub && <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-stale">{sub}</p>}
    </div>
  );
}

function ProbBar({ home, draw, away, active }: { home: number; draw: number; away: number; active: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-chalk/10">
        <div className="prob-bar-home h-full transition-[width] duration-700 ease-out"
          style={{ width: active ? `${home}%` : "0%" }} />
        <div className="prob-bar-draw h-full transition-[width] duration-700 delay-100 ease-out"
          style={{ width: active ? `${draw}%` : "0%" }} />
        <div className="prob-bar-away h-full transition-[width] duration-700 delay-200 ease-out"
          style={{ width: active ? `${away}%` : "0%" }} />
      </div>
      <div className="flex justify-between font-label text-[10px] font-semibold uppercase tracking-widest">
        <span className="text-leaf tabular-nums">{home}% H</span>
        <span className="text-stale tabular-nums">{draw}% D</span>
        <span className="text-flame tabular-nums">{away}% A</span>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  NAV                                                    */
/* ──────────────────────────────────────────────────────── */
function Nav() {
  const { scrollY } = useScroll();
  const bg = useTransform(scrollY, [0, 64], [0, 1]);
  return (
    <motion.header
      style={{ backgroundColor: useTransform(bg, (v) => `rgba(243,245,242,${0.8 * v})`) }}
      className="fixed top-0 inset-x-0 z-50 border-b border-transparent backdrop-blur-md"
    >
      <motion.div
        style={{ borderColor: useTransform(bg, (v) => `rgba(11,15,12,${0.1 * v})`) }}
        className="mx-auto flex w-full max-w-7xl items-center justify-between border-b px-6 py-3.5"
      >
        <Brand />

        <nav className="hidden md:flex items-center gap-8">
          {[["#method", "The Method"], ["#track", "Track Record"], ["#comps", "Competitions"]].map(([href, label]) => (
            <a key={href} href={href}
              className="group relative font-label text-[12px] font-semibold uppercase tracking-[0.2em] text-stale transition-colors duration-200 hover:text-chalk">
              {label}
              <span className="absolute -bottom-1.5 left-0 h-px w-0 bg-ember transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
        </nav>

        <Link href="/login"
          className="group inline-flex items-center gap-2 rounded-full bg-ember px-6 py-2.5 font-label text-[12px] font-bold uppercase tracking-widest text-[#221A00] transition-all duration-300 hover:bg-flame">
          Sign In
          <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
        </Link>
      </motion.div>
    </motion.header>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  HERO                                                   */
/* ──────────────────────────────────────────────────────── */
function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: 0.1 });
      tl.from(".hl-1", { yPercent: 118, duration: 0.85, ease: "power4.out" })
        .from(".hl-2", { yPercent: 118, duration: 0.85, ease: "power4.out" }, "-=0.62")
        .from(".hl-3", { yPercent: 118, duration: 0.9, ease: "power4.out" }, "-=0.62")
        .from(".hero-eyebrow", { y: 16, opacity: 0, duration: 0.5, ease: "power3.out" }, "-=0.5")
        .from(".hero-sub", { y: 24, opacity: 0, duration: 0.7, ease: "power3.out" }, "-=0.35")
        .from(".hero-ctas", { y: 20, opacity: 0, duration: 0.6, ease: "power3.out" }, "-=0.4")
        .from(".hero-board", { x: 64, opacity: 0, duration: 1.0, ease: "power4.out" }, "<0.1")
        .from(".hero-stats > *", { y: 14, opacity: 0, stagger: 0.08, duration: 0.5, ease: "power2.out" }, "-=0.7");

      gsap.to(".hero-pitch-bg", {
        yPercent: 22,
        ease: "none",
        scrollTrigger: { trigger: sectionRef.current, start: "top top", end: "bottom top", scrub: true },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, [reduce]);

  return (
    <section ref={sectionRef} className="relative min-h-screen overflow-hidden bg-ink">
      {/* tactical pitch grid */}
      <div className="hero-pitch-bg absolute inset-0 pointer-events-none opacity-[0.5]">
        <div className="pitch-lines absolute inset-0" style={{ maskImage: "linear-gradient(180deg, black 0%, transparent 90%)", WebkitMaskImage: "linear-gradient(180deg, black 0%, transparent 90%)" }} />
      </div>
      {/* gold radial bloom */}
      <div className="pointer-events-none absolute -top-40 right-0 h-[560px] w-[560px] rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(242,176,28,0.22), transparent 70%)" }} />
      {/* ghost number */}
      <div className="absolute bottom-0 left-[-1rem] select-none pointer-events-none">
        <span className="ghost-number text-chalk" style={{ fontSize: "clamp(200px, 26vw, 360px)" }}>10</span>
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6">
        <div className="grid flex-1 items-center gap-12 pt-28 pb-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">

          {/* LEFT — broadcast copy */}
          <div>
            <motion.div className="hero-eyebrow mb-7 flex items-center gap-3">
              <span className="relative flex h-2 w-2">
                <span className="live-ping absolute inset-0 rounded-full bg-live" />
                <span className="relative h-2 w-2 rounded-full bg-live" />
              </span>
              <span className="font-label text-[11px] font-bold uppercase tracking-[0.24em] text-stale">
                Dixon-Coles + SOT · La Liga &amp; UCL
              </span>
            </motion.div>

            <h1 className="font-display leading-[0.88] tracking-tight">
              <span className="block overflow-hidden mb-1">
                <span className="hl-1 block text-chalk text-[clamp(64px,9vw,132px)]">THIS</span>
              </span>
              <span className="block overflow-hidden mb-1">
                <span className="hl-2 block text-chalk text-[clamp(64px,9vw,132px)]">ISN&apos;T A</span>
              </span>
              <span className="block overflow-hidden">
                <span className="hl-3 block text-[clamp(64px,9vw,132px)] text-stroke-ember">
                  GUESS<span className="text-chalk">.</span>
                </span>
              </span>
            </h1>

            <div className="hero-sub mt-8 mb-6 flex items-center gap-4">
              <div className="h-px flex-1 bg-chalk/15" />
              <span className="font-label text-[11px] uppercase tracking-[0.28em] text-stale">It&apos;s a read.</span>
              <span className="h-1.5 w-1.5 rounded-full bg-leaf" />
            </div>

            <p className="hero-sub max-w-lg text-[15px] leading-relaxed text-stale">
              Real form, expected goals, injuries &amp; H2H — fed into a model backtested on
              1,527 matches against bookmaker closing odds. Every number shows its reasoning.
            </p>

            <div className="hero-ctas mt-10 flex flex-wrap items-center gap-4">
              <Link href="/login"
                className="group inline-flex items-center gap-2 rounded-xl bg-ember px-7 py-4 font-label text-[13px] font-bold uppercase tracking-widest text-[#221A00] transition-all duration-300 hover:bg-flame hover:-translate-y-0.5 ember-glow">
                Get My First Prediction
                <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
              </Link>
              <a href="#method"
                className="inline-flex items-center gap-2 rounded-xl border border-chalk/20 px-7 py-4 font-label text-[13px] font-bold uppercase tracking-widest text-stale transition-all duration-200 hover:border-chalk/50 hover:text-chalk">
                See the Method
              </a>
            </div>
          </div>

          {/* RIGHT — striker + live board */}
          <div className="hero-board relative">
            <div className="crop-marks relative rounded-2xl border border-chalk/10 bg-panel p-4 sm:p-5 overflow-hidden">
              {/* board header */}
              <div className="mb-2 flex items-center justify-between border-b border-chalk/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="live-ping absolute inset-0 rounded-full bg-leaf" />
                    <span className="relative h-2 w-2 rounded-full bg-leaf" />
                  </span>
                  <span className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-leaf2">Live Read</span>
                </div>
                <span className="font-label text-[10px] uppercase tracking-widest text-stale">UCL · LP R2 · Bernabéu</span>
              </div>

              <div className="relative overflow-hidden rounded-xl border border-chalk/10">
                <div className="relative h-[280px] overflow-hidden bg-forest sm:h-[320px]">
                  {/* slow ken-burns drift */}
                  <motion.div
                    initial={{ scale: 1.18 }}
                    animate={{ scale: 1.02 }}
                    transition={{ duration: 16, ease: [0.16, 1, 0.3, 1], delay: 1 }}
                    className="absolute inset-0"
                  >
                    <Image
                      src="/img/rm-vs-bayern.jpg"
                      alt="Real Madrid players in action against Bayern Munich"
                      fill
                      sizes="(max-width: 1024px) 90vw, 46vw"
                      className="object-cover object-center"
                    />
                  </motion.div>

                  {/* tactical grid over photo */}
                  <div className="pitch-lines pointer-events-none absolute inset-0 opacity-[0.12]"
                    style={{ maskImage: "linear-gradient(180deg, transparent 15%, black 65%)", WebkitMaskImage: "linear-gradient(180deg, transparent 15%, black 65%)" }} />
                  {/* scanline sweep */}
                  <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div className="animate-scanline h-full w-24 bg-gradient-to-r from-transparent via-[#0B0F0C]/15 to-transparent" />
                  </div>

                  {/* broadcast overlays */}
                  <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-[#0B0F0C]/75 px-2.5 py-1.5 backdrop-blur-sm">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="live-ping absolute inset-0 rounded-full bg-live" />
                      <span className="relative h-1.5 w-1.5 rounded-full bg-live" />
                    </span>
                    <span className="font-label text-[9px] font-bold uppercase tracking-[0.22em] text-white">Live · 63&apos;</span>
                  </div>
                  <div className="absolute right-3 top-3 rounded-md bg-[#0B0F0C]/75 px-2.5 py-1.5 font-label text-[9px] font-bold uppercase tracking-[0.22em] text-white backdrop-blur-sm tabular-nums">
                    RMA 1–0 MCI
                  </div>

                  {/* grade into board */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-panel to-transparent" />
                </div>
              </div>

              {/* score bug */}
              <div className="relative mt-2 border-t border-chalk/10 pt-4">
                <div className="flex items-center justify-between">
                  <span className="font-display text-4xl tracking-tight text-chalk">RMA</span>
                  <span className="flex items-center gap-3 font-display text-4xl text-chalk tabular-nums">
                    <span>1</span>
                    <span className="text-[16px] text-stale">—</span>
                    <span>0</span>
                  </span>
                  <span className="font-display text-4xl tracking-tight text-chalk">MCI</span>
                </div>
                <div className="mt-2 flex items-center justify-between font-label text-[10px] uppercase tracking-widest text-stale">
                  <span>xG 1.31</span>
                  <span>SoT 5–3</span>
                  <span className={CONF_STYLES.LOW.chip + " rounded-full border px-2.5 py-0.5"}>LOW</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* stats strip */}
        <div className="hero-stats relative z-10 mb-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-chalk/10 bg-chalk/10 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="bg-panel px-6 py-5">
              <div className="font-display text-4xl text-chalk tabular-nums">
                <CountUp value={s.value} suffix={s.suffix} />
              </div>
              <div className="mt-1 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-stale">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  SCORE MARQUEE                                          */
/* ──────────────────────────────────────────────────────── */
function ScoreBar() {
  const items = [...TICKER, ...TICKER, ...TICKER];
  return (
    <div className="relative overflow-hidden border-y-[3px] border-chalk/30 bg-ember py-3">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.08]">
        <span className="font-display whitespace-nowrap text-[120px] text-[#221A00]">FULL TIME RESULTS</span>
      </div>
      <div className="flex w-max animate-ticker items-center">
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-5 px-8 font-label text-[13px] font-bold uppercase tracking-[0.22em] text-[#221A00]">
            {item}
            <span className="h-1.5 w-1.5 rounded-full bg-[#221A00]/40" />
          </span>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  MATCHDAY BOARD (fixture carousel)                      */
/* ──────────────────────────────────────────────────────── */
function MatchCard({ m, active }: { m: typeof MATCHES[0]; active: boolean }) {
  const cs = CONF_STYLES[m.conf];
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -18, scale: 0.98 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-0"
    >
      <div className="crop-marks flex h-full flex-col rounded-2xl border border-chalk/10 bg-panel p-6">
        {/* top bar */}
        <div className="mb-5 flex items-center justify-between border-b border-chalk/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-ember" />
            <span className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-chalk">{m.comp}</span>
          </div>
          <span className="font-label text-[10px] uppercase tracking-widest text-stale">{m.tag} · {m.season}</span>
        </div>

        {/* teams */}
        <div className="mb-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="text-center">
            <div className="font-display text-5xl text-chalk tracking-tight">{m.homeCode}</div>
            <div className="mt-1 text-[13px] font-semibold text-stale">{m.home}</div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="font-display text-2xl text-stale/60">VS</span>
            <span className="font-label text-[9px] uppercase tracking-[0.25em] text-stale">xG vs xG</span>
          </div>
          <div className="text-center">
            <div className="font-display text-5xl text-chalk tracking-tight">{m.awayCode}</div>
            <div className="mt-1 text-[13px] font-semibold text-stale">{m.away}</div>
          </div>
        </div>

        {/* xG projected */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-stale/[0.08] px-4 py-3">
            <div className="font-display text-2xl text-leaf tabular-nums">{m.hs.toFixed(2)}</div>
            <div className="font-label text-[9px] uppercase tracking-widest text-stale">{m.homeCode} xG Projected</div>
          </div>
          <div className="rounded-xl bg-stale/[0.08] px-4 py-3">
            <div className="font-display text-2xl text-flame tabular-nums">{m.as.toFixed(2)}</div>
            <div className="font-label text-[9px] uppercase tracking-widest text-stale">{m.awayCode} xG Projected</div>
          </div>
        </div>

        {/* prob bar */}
        <ProbBar home={m.homeWin} draw={m.draw} away={m.awayWin} active={active} />

        {/* confidence + date */}
        <div className="mt-5 flex items-center justify-between">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-label text-[11px] font-bold uppercase tracking-wider ${cs.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cs.dot}`} />
            {m.conf}
          </span>
          <span className="font-label text-[10px] uppercase tracking-widest text-stale">{m.date}</span>
        </div>

        {/* the read */}
        <div className="mt-5 flex-1 rounded-xl bg-stale/[0.08] p-4">
          <p className="mb-2 font-label text-[9px] font-bold uppercase tracking-[0.25em] text-ember">The Read</p>
          <div className="space-y-2">
            {m.why.map((line, i) => (
              <div key={i} className="flex gap-2 text-[12px] leading-snug text-stale">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ember/70" />
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function MatchdayBoard() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % MATCHES.length), 8000);
    return () => clearInterval(t);
  }, []);

  return (
    <section id="board" className="relative scroll-mt-16 bg-coal py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <SectionHead
            index="01"
            label="The Matchday Board"
            title={<>WHO THE MODEL <br />FANCIES <span className="text-stroke-ember">TODAY.</span></>}
            sub="Three live reads built from form, xG, availability and head-to-head data. Autoplayting — skip with the controls."
          />
        </div>

        <div className="relative mx-auto h-[560px] max-w-[440px]">
          <AnimatePresence mode="wait" initial={false}>
            <MatchCard key={MATCHES[idx].homeCode} m={MATCHES[idx]} active />
          </AnimatePresence>
        </div>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button type="button" onClick={() => setIdx((i) => (i - 1 + MATCHES.length) % MATCHES.length)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-chalk/15 text-stale transition-all duration-200 hover:border-chalk/40 hover:text-chalk"
            aria-label="Previous match">
            ←
          </button>
          <div className="flex items-center gap-2">
            {MATCHES.map((_, i) => (
              <button key={i} type="button" onClick={() => setIdx(i)} aria-label={`Match ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? "w-6 bg-ember" : "w-1.5 bg-chalk/25 hover:bg-chalk/50"}`} />
            ))}
          </div>
          <button type="button" onClick={() => setIdx((i) => (i + 1) % MATCHES.length)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-chalk/15 text-stale transition-all duration-200 hover:border-chalk/40 hover:text-chalk"
            aria-label="Next match">
            →
          </button>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  THE METHOD                                             */
/* ──────────────────────────────────────────────────────── */
function Method() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const ctx = gsap.context(() => {
      gsap.from(".method-card", {
        y: 44, opacity: 0, duration: 0.75, stagger: 0.09, ease: "power3.out",
        scrollTrigger: { trigger: ".method-card", start: "top 84%", toggleActions: "play none none none" },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, [reduce]);

  return (
    <section id="method" ref={sectionRef} className="relative scroll-mt-16 overflow-hidden bg-ink py-24 lg:py-36">
      <div className="pointer-events-none absolute -right-8 top-0 select-none">
        <span className="ghost-number text-chalk" style={{ fontSize: "clamp(180px, 22vw, 320px)" }}>xG</span>
      </div>

      <div className="relative mx-auto max-w-7xl px-6">
        <SectionHead
          index="02"
          label="The Method"
          title={<>WHY THIS <br />PREDICTION? <br /><span className="text-stroke-ember">WE SHOW YOU.</span></>}
          sub="Transparency is the product. Every number traces back to an input you can inspect — no black box, no hand-waving."
          className="mb-16"
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {METHOD_CARDS.map((c) => (
            <div key={c.tag} className="method-card group relative cursor-default overflow-hidden rounded-2xl border border-chalk/10 bg-panel p-6 transition-all duration-300 hover:border-ember/50 hover:bg-ember">
              <span className="pointer-events-none absolute -right-2 -top-4 font-display text-[84px] text-chalk/10 transition-colors duration-300 group-hover:text-chalk/20">
                {c.tag}
              </span>
              <div className="mb-6 flex items-start justify-between">
                <span className="rounded-md bg-ember/10 px-2.5 py-1 font-label text-[11px] font-bold uppercase tracking-widest text-flame transition-colors duration-300 group-hover:bg-[#221A00]/15 group-hover:text-[#221A00]">
                  {c.label}
                </span>
                <span className="font-label text-[10px] text-stale transition-colors duration-300 group-hover:text-[#221A00]/70 tabular-nums">{c.tag}</span>
              </div>
              <div className="mb-4 text-stale transition-colors duration-300 group-hover:text-[#221A00]">{c.icon}</div>
              <h3 className="mb-2 font-display text-3xl text-chalk transition-colors duration-300 group-hover:text-[#221A00]">{c.title}</h3>
              <p className="text-[13px] leading-relaxed text-stale transition-colors duration-300 group-hover:text-[#221A00]/80">{c.desc}</p>
              <p className="mt-3 font-label text-[10px] tracking-widest text-stale/70 transition-colors duration-300 group-hover:text-[#221A00]/70">{c.note}</p>
            </div>
          ))}
        </div>

        {/* model banner */}
        <div className="crop-marks mt-6 overflow-hidden rounded-2xl border-2 border-leaf/40 bg-forest px-7 py-7">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="font-display text-3xl text-chalk tracking-tight">DIXON-COLES + POISSON</p>
              <p className="mt-1 text-[14px] text-chalk/60">
                Scoring model calibrated on 1,527 real matches — blended with a recency-aware SOT layer.
              </p>
            </div>
            <span className="rounded-xl bg-leaf px-5 py-2.5 font-label text-[12px] font-bold uppercase tracking-widest text-[#0B3D24]">
              Fit → Predict
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  TRACK RECORD                                           */
/* ──────────────────────────────────────────────────────── */
function TrackRecord() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const ctx = gsap.context(() => {
      gsap.from(".tr-card", {
        y: 40, opacity: 0, duration: 0.7, stagger: 0.08, ease: "power3.out",
        scrollTrigger: { trigger: ".tr-card", start: "top 85%", toggleActions: "play none none none" },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, [reduce]);

  return (
    <section id="track" ref={sectionRef} className="relative scroll-mt-16 py-24 lg:py-36">
      {/* skewed field */}
      <div className="absolute inset-0 skew-y-[-2.5deg] scale-[1.02] overflow-hidden bg-forest pointer-events-none">
        <div className="relative h-full w-full">
          <Image
            src="/img/rm-cl2018.jpg"
            alt="Real Madrid players lifting the 2018 Champions League trophy"
            fill
            sizes="100vw"
            className="object-cover object-center"
          />
        </div>
        <div className="absolute inset-0 bg-forest/75" />
        <PitchSVG className="mx-auto h-full w-full max-w-5xl text-chalk" opacity={0.05} />
      </div>
      <div className="pointer-events-none absolute -left-4 top-0 select-none">
        <span className="ghost-number" style={{ fontSize: "clamp(170px, 20vw, 300px)" }}>90</span>
      </div>

      <div className="relative mx-auto max-w-7xl px-6 py-8">
        <SectionHead
          index="03"
          label="The Receipts"
          title={<>WE SHOW <br />ACCURACY, <br /><span className="text-stroke-chalk">NOT JUST CONFIDENCE.</span></>}
          sub="A confidence score is worthless if you never check it against reality. We backtest against bookmaker closing odds — and publish the result, win or lose."
          className="mb-14"
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="tr-card crop-marks rounded-2xl border border-chalk/10 bg-white/80 p-6 backdrop-blur-md">
              <div className="font-display text-[clamp(44px,5vw,64px)] text-chalk leading-none tabular-nums">
                <CountUp value={s.value} suffix={s.suffix} />
              </div>
              <div className="mt-3 font-label text-[11px] font-bold uppercase tracking-wide text-leaf2">{s.label}</div>
              <p className="mt-1 text-[13px] leading-snug text-chalk/45">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* calibration bar vs bookmakers */}
        <div className="tr-card mt-6 rounded-2xl border border-chalk/10 bg-white/80 p-6 backdrop-blur-md">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="font-label text-[11px] font-bold uppercase tracking-[0.24em] text-chalk/70">Vs Bookmaker Closing Odds</span>
            <span className="font-label text-[10px] uppercase tracking-widest text-stale">last 1,527 fixtures</span>
          </div>
          <div className="relative h-14">
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-chalk/15" />
            <div className="absolute top-1/2 flex w-full -translate-y-1/2 items-center justify-between">
              <div className="relative flex flex-col items-center">
                <span className="h-2.5 w-px bg-chalk/40" />
                <span className="mt-1 font-label text-[10px] uppercase tracking-wider text-stale">40%</span>
              </div>
              <div className="relative flex flex-col items-center">
                <span className="h-2.5 w-px bg-chalk/40" />
                <span className="mt-1 font-label text-[10px] uppercase tracking-wider text-stale">45%</span>
              </div>
              <div className="relative flex flex-col items-center">
                <span className="h-2.5 w-px bg-leaf" />
                <span className="mt-1 font-label text-[10px] font-bold uppercase tracking-wider text-leaf">50%</span>
              </div>
              <div className="relative flex flex-col items-center">
                <span className="h-2.5 w-px bg-chalk/40" />
                <span className="mt-1 font-label text-[10px] uppercase tracking-wider text-stale">55%</span>
              </div>
              <div className="relative flex flex-col items-center">
                <span className="h-2.5 w-px bg-chalk/40" />
                <span className="mt-1 font-label text-[10px] uppercase tracking-wider text-stale">60%</span>
              </div>
            </div>
            {/* our marker */}
            <div className="absolute top-1/2 -translate-y-1/2" style={{ left: "51.5%" }}>
              <div className="flex flex-col items-center">
                <span className="rounded-full border border-leaf bg-white px-2 py-0.5 font-label text-[10px] font-bold tabular-nums text-leaf2">50.3%</span>
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-leaf leaf-glow" />
              </div>
            </div>
            {/* house marker */}
            <div className="absolute top-1/2 -translate-y-1/2" style={{ left: "62%" }}>
              <div className="flex flex-col items-center">
                <span className="rounded-full border border-chalk/25 bg-white px-2 py-0.5 font-label text-[10px] font-bold tabular-nums text-stale">52.4%</span>
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-chalk/40" />
              </div>
            </div>
          </div>
        </div>

        <p className="tr-card mt-8 max-w-3xl text-[13px] leading-relaxed text-chalk/40">
          Honest framing: beating bookmakers long-term is hard — which is exactly why we publish the comparison
          instead of hiding it. Our edge is transparency and discipline, not certainty.
        </p>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  COMPETITIONS                                           */
/* ──────────────────────────────────────────────────────── */
function Competitions() {
  return (
    <section id="comps" className="relative scroll-mt-16 overflow-hidden bg-ink py-24 lg:py-36">
      <div className="pointer-events-none absolute -right-4 bottom-0 select-none">
        <span className="ghost-number text-chalk" style={{ fontSize: "clamp(160px, 20vw, 300px)" }}>11</span>
      </div>

      <div className="relative mx-auto max-w-7xl px-6">
        <SectionHead
          index="04"
          label="Where We Live"
          title={<>TWO <br />COMPETITIONS. <br /><span className="text-stroke-ember">TRACKED OBSESSIVELY.</span></>}
          className="mb-14"
        />

        <div className="grid gap-6 md:grid-cols-2">
          {/* La Liga */}
          <div className="crop-marks group relative flex min-h-[440px] flex-col justify-between overflow-hidden rounded-3xl border border-chalk/10 p-10 transition-all duration-400 hover:-translate-y-1">
            <div className="absolute inset-0">
              <Image
                src="/img/laliga.jpg"
                alt="La Liga evening fixture at Montilivi"
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover object-center"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-forest/80 via-forest2/65 to-forest/90" />
            <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full border-2 border-chalk/15" />
            <div className="relative">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full bg-white/50 px-3.5 py-1.5 backdrop-blur-sm">
                <span className="h-2 w-2 rounded-full bg-leaf" />
                <span className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-chalk/80">Spain · Top Flight</span>
              </div>
              <h3 className="font-display text-[72px] leading-[0.85] tracking-tight text-chalk">LA<br />LIGA</h3>
              <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-chalk/55">
                Every matchday tracked. Form curves, xG trajectories and injury deltas across all 380 fixtures — zero guesswork.
              </p>
            </div>
            <div className="relative flex items-end justify-between">
              <span className="font-label text-[11px] tracking-widest text-leaf2/70 uppercase">380 Fixtures · 2026/27</span>
              <div className="flex items-center gap-2 font-display text-[64px] leading-none text-chalk/10">
                <span>OSA</span><span className="text-[28px]">1–0</span><span>VAL</span>
              </div>
            </div>
          </div>

          {/* UCL */}
          <div className="crop-marks group relative flex min-h-[440px] flex-col justify-between overflow-hidden rounded-3xl border border-chalk/10 p-10 transition-all duration-400 hover:-translate-y-1">
            <div className="absolute inset-0">
              <Image
                src="/img/rm-team.jpg"
                alt="Real Madrid team line-up before a Champions League night"
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover object-center"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-[#E9F1FF]/80 via-[#DCE8FF]/70 to-[#C9DBFA]/85" />
            <div className="absolute -top-20 right-0 h-80 w-80 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(closest-side, rgba(122,167,255,0.28), transparent 70%)" }} />
            <div className="relative">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full bg-white/50 px-3.5 py-1.5 backdrop-blur-sm">
                <span className="h-2 w-2 rounded-full bg-[#2B6BE8]" />
                <span className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-chalk/80">Europe · Champions</span>
              </div>
              <h3 className="font-display text-[60px] leading-[0.85] tracking-tight text-chalk">UEFA<br />CHAMPIONS<br />LEAGUE</h3>
              <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-chalk/50">
                The knockout moments where one read separates clarity from panic. League phase through to the final.
              </p>
            </div>
            <div className="relative flex items-end justify-between">
              <span className="font-label text-[11px] tracking-widest text-[#2B6BE8]/80 uppercase">League Phase → Final</span>
              <div className="font-display text-[64px] leading-none text-chalk/10">UCL</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  CTA + FOOTER                                           */
/* ──────────────────────────────────────────────────────── */
function CTABanner() {
  return (
    <section className="relative overflow-hidden bg-ember py-24 lg:py-32">
      <div className="skew-y-[-2.5deg] absolute inset-0 scale-[1.02] opacity-[0.06]"
        style={{ backgroundImage: "repeating-linear-gradient(-45deg, #221A00 0, #221A00 2px, transparent 2px, transparent 34px)" }} />
      <div className="relative mx-auto max-w-5xl px-6 text-center">
        <p className="mb-6 font-label text-[12px] font-bold uppercase tracking-[0.3em] text-[#221A00]/80">
          Your First Prediction Is Free
        </p>
        <h2 className="font-display leading-[0.88] text-[#221A00] text-[clamp(52px,7.5vw,108px)]">
          SEE THE READ<br />
          BEFORE YOU<br />
          <span className="text-stroke-chalk" style={{ WebkitTextStroke: "2.5px #221A00" }}>PLACE ANYTHING.</span>
        </h2>
        <p className="mx-auto mt-7 max-w-xl text-[16px] leading-relaxed text-[#221A00]/80">
          We&apos;ll show you the numbers, the confidence band and the reasoning — then you decide.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link href="/login"
            className="group inline-flex items-center gap-2 rounded-xl bg-[#0B0F0C] px-8 py-4 font-label text-[13px] font-bold uppercase tracking-widest text-white transition-all duration-300 hover:bg-[#223A2F] hover:-translate-y-0.5">
            Get My First Prediction
            <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
          </Link>
          <a href="#method"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-chalk/40 px-8 py-4 font-label text-[13px] font-bold uppercase tracking-widest text-chalk/90 transition-all duration-200 hover:border-chalk">
            Revisit the Method
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative border-t border-chalk/10 bg-ink px-6 py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-6 sm:flex-row">
        <Brand href="/" size="lg" />
        <nav className="flex items-center gap-6">
          {[["#method", "Method"], ["#track", "Track"], ["#comps", "Comps"]].map(([href, label]) => (
            <a key={href} href={href} className="font-label text-[11px] uppercase tracking-[0.22em] text-stale transition-colors duration-200 hover:text-chalk">
              {label}
            </a>
          ))}
          <Link href="/login" className="font-label text-[11px] uppercase tracking-[0.22em] text-ember transition-colors duration-200 hover:text-flame">
            Sign In
          </Link>
        </nav>
        <div className="text-center">
          <p className="font-label text-[10px] uppercase tracking-widest text-stale">
            Probability, not certainty.
          </p>
          <p className="mt-1 font-label text-[10px] uppercase tracking-widest text-stale/60">
            © 2026 Onside · La Liga + UCL
          </p>
          <p className="mt-1 font-label text-[9px] uppercase tracking-wider text-stale/45">
            Photos: Wikimedia Commons (CC BY / CC BY-SA)
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  PAGE                                                   */
/* ──────────────────────────────────────────────────────── */
export default function Landing() {
  return (
    <main className="relative overflow-x-clip">
      <Nav />
      <Hero />
      <ScoreBar />
      <MatchdayBoard />
      <Method />
      <TrackRecord />
      <Competitions />
      <CTABanner />
      <Footer />
    </main>
  );
}