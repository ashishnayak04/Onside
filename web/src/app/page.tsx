"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useScroll,
  useTransform,
  AnimatePresence,
} from "framer-motion";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

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
    comp: "UCL", tag: "LP R2 · Bernabéu", season: "2025/26",
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
  "BAR 5–1 VLL ◆", "MCI 2–1 ARS ◆", "REAL 3–1 SEV ◆",
  "ATM 1–1 SOC ◆", "OSA 2–1 VIL ◆", "ATH 0–2 GIR ◆",
  "CEL 1–1 ESP ◆", "MAL 0–3 MAD ◆", "GET 1–0 RAY ◆",
];

const CONF_STYLES = {
  HIGH:   { chip: "bg-[#dcfce7] text-[#14532d] border-[#86efac]", dot: "#22c55e" },
  MEDIUM: { chip: "bg-[#fef9c3] text-[#713f12] border-[#fde047]", dot: "#eab308" },
  LOW:    { chip: "bg-[#dbeafe] text-[#1e3a8a] border-[#93c5fd]", dot: "#3b82f6" },
};

/* ──────────────────────────────────────────────────────── */
/*  SPRING COUNT-UP                                         */
/* ──────────────────────────────────────────────────────── */
function CountUp({ value, suffix = "", color = "inherit" }: { value: string; suffix?: string; color?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const num = parseFloat(value);
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 50, damping: 14, mass: 0.8 });
  const dec = value.includes(".") ? value.split(".")[1].length : 0;

  useEffect(() => { if (inView) mv.set(num); }, [inView, mv, num]);
  useEffect(() =>
    spring.on("change", (v) => {
      if (ref.current) ref.current.textContent = v.toFixed(dec) + suffix;
    }),
    [spring, dec, suffix]
  );

  return <span ref={ref} style={{ color }}>{"0" + suffix}</span>;
}

/* ──────────────────────────────────────────────────────── */
/*  PROBABILITY BAR                                         */
/* ──────────────────────────────────────────────────────── */
function ProbBar({ home, draw, away }: { home: number; draw: number; away: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <div ref={ref} className="space-y-2">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-[#0D3320]/10 gap-px">
        {[
          { w: home, cls: "rounded-l-full bg-[#1B5E37]" },
          { w: draw, cls: "bg-[#94a3b8]" },
          { w: away, cls: "rounded-r-full bg-[#FF4D00]" },
        ].map((s, i) => (
          <motion.div key={i} className={`h-full ${s.cls}`}
            initial={{ width: 0 }}
            animate={inView ? { width: `${s.w}%` } : { width: 0 }}
            transition={{ duration: 1.1, delay: 0.1 + i * 0.1, ease: [0.34, 1.2, 0.64, 1] }}
          />
        ))}
      </div>
      <div className="flex justify-between font-label text-[11px] font-semibold uppercase tracking-widest">
        <span style={{ color: "#1B5E37" }}>{home}% H</span>
        <span style={{ color: "#94a3b8" }}>{draw}% D</span>
        <span style={{ color: "#FF4D00" }}>{away}% A</span>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  FOOTBALL PITCH SVG (decorative)                        */
/* ──────────────────────────────────────────────────────── */
function PitchSVG({ className = "", opacity = 0.07 }: { className?: string; opacity?: number }) {
  return (
    <svg className={className} viewBox="0 0 800 500" fill="none"
      xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
      {/* Outer boundary */}
      <rect x="20" y="20" width="760" height="460" stroke="currentColor" strokeWidth="2" />
      {/* Halfway line */}
      <line x1="400" y1="20" x2="400" y2="480" stroke="currentColor" strokeWidth="2" />
      {/* Centre circle */}
      <circle cx="400" cy="250" r="80" stroke="currentColor" strokeWidth="2" />
      <circle cx="400" cy="250" r="4" fill="currentColor" />
      {/* Left penalty box */}
      <rect x="20" y="155" width="110" height="190" stroke="currentColor" strokeWidth="2" />
      <rect x="20" y="205" width="50" height="90" stroke="currentColor" strokeWidth="2" />
      <circle cx="130" cy="250" r="35" stroke="currentColor" strokeWidth="2" strokeDasharray="8 4" />
      {/* Right penalty box */}
      <rect x="670" y="155" width="110" height="190" stroke="currentColor" strokeWidth="2" />
      <rect x="730" y="205" width="50" height="90" stroke="currentColor" strokeWidth="2" />
      <circle cx="670" cy="250" r="35" stroke="currentColor" strokeWidth="2" strokeDasharray="8 4" />
      {/* Corner arcs */}
      <path d="M20,20 Q30,20 30,30" stroke="currentColor" strokeWidth="2" />
      <path d="M780,20 Q770,20 770,30" stroke="currentColor" strokeWidth="2" />
      <path d="M20,480 Q30,480 30,470" stroke="currentColor" strokeWidth="2" />
      <path d="M780,480 Q770,480 770,470" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  MATCH CARD                                             */
/* ──────────────────────────────────────────────────────── */
function MatchCard({ m, active }: { m: typeof MATCHES[0]; active: boolean }) {
  const cs = CONF_STYLES[m.conf];
  return (
    <AnimatePresence mode="wait">
      {active && (
        <motion.div
          key={m.homeCode}
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.97 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0"
        >
          <div className="h-full bg-white rounded-2xl border border-[#0D3320]/08 shadow-[0_32px_72px_-16px_rgba(13,51,32,0.14)] overflow-hidden flex flex-col">
            {/* Top bar */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#0D3320]">
              <div className="flex items-center gap-2">
                <span className="relative h-2.5 w-2.5 flex-shrink-0">
                  <span className="live-ping absolute inset-0 rounded-full bg-red-400/60" />
                  <span className="relative block h-2.5 w-2.5 rounded-full bg-red-400" />
                </span>
                <span className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-red-300">Live Read</span>
              </div>
              <span className="font-label text-[10px] text-white/50 uppercase tracking-widest">{m.comp} · {m.tag}</span>
              <span className="font-label text-[10px] text-white/30">{m.season}</span>
            </div>

            <div className="flex-1 p-5 flex flex-col gap-4 overflow-hidden">
              {/* xG Board */}
              <div className="flex items-center">
                <div className="flex-1 text-center">
                  <div className="w-14 h-14 rounded-xl bg-[#F0F2EE] border border-[#0D3320]/10 flex items-center justify-center mx-auto mb-2">
                    <span className="font-headline text-xl text-[#0D3320]">{m.homeCode}</span>
                  </div>
                  <div className="font-label text-4xl font-bold text-[#0D3320] tabular-nums leading-none">{m.hs.toFixed(2)}</div>
                  <div className="font-label text-[9px] uppercase tracking-widest text-[#0D3320]/35 mt-1">xG Projected</div>
                </div>

                <div className="flex flex-col items-center gap-0.5 px-2">
                  <div className="font-headline text-4xl text-[#0D3320]/15 leading-none">VS</div>
                </div>

                <div className="flex-1 text-center">
                  <div className="w-14 h-14 rounded-xl bg-[#F0F2EE] border border-[#0D3320]/10 flex items-center justify-center mx-auto mb-2">
                    <span className="font-headline text-xl text-[#0D3320]">{m.awayCode}</span>
                  </div>
                  <div className="font-label text-4xl font-bold text-[#0D3320] tabular-nums leading-none">{m.as.toFixed(2)}</div>
                  <div className="font-label text-[9px] uppercase tracking-widest text-[#0D3320]/35 mt-1">xG Projected</div>
                </div>
              </div>

              {/* Full names */}
              <div className="flex justify-between text-[13px] font-semibold text-[#0D3320]/55 border-t border-[#0D3320]/05 pt-3">
                <span>{m.home}</span>
                <span className="text-[#0D3320]/20 font-normal">vs</span>
                <span>{m.away}</span>
              </div>

              {/* Prob bar */}
              <ProbBar home={m.homeWin} draw={m.draw} away={m.awayWin} />

              {/* Confidence */}
              <div className="flex items-center justify-between">
                <span className="font-label text-[10px] uppercase tracking-widest text-[#0D3320]/35">Confidence</span>
                <span className={`rounded-md border px-2.5 py-1 font-label text-[11px] font-bold uppercase tracking-wider ${cs.chip}`}>
                  {m.conf}
                </span>
              </div>

              {/* Why */}
              <div className="rounded-xl bg-[#F0F2EE] p-3.5 space-y-2 flex-1">
                <p className="font-label text-[9px] font-bold uppercase tracking-[0.25em] text-[#0D3320]/40">The Read</p>
                {m.why.map((line, i) => (
                  <div key={i} className="flex gap-2 text-[11.5px] leading-snug text-[#0D3320]/65">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF4D00]/70" />
                    {line}
                  </div>
                ))}
              </div>

              {/* Date */}
              <div className="font-label text-[10px] text-[#0D3320]/30 uppercase tracking-widest text-center">{m.date}</div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MatchCentre() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % MATCHES.length), 7500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative w-full max-w-[360px] mx-auto">
      <div className="relative h-[560px]">
        {MATCHES.map((m, i) => <MatchCard key={m.homeCode} m={m} active={i === idx} />)}
      </div>
      <div className="mt-4 flex justify-center gap-2">
        {MATCHES.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)} aria-label={`Match ${i + 1}`}
            className={`rounded-full transition-all duration-300 ${i === idx ? "w-8 h-2.5 bg-[#FF4D00]" : "w-2.5 h-2.5 bg-[#0D3320]/20 hover:bg-[#0D3320]/40"}`}
          />
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  NAV                                                    */
/* ──────────────────────────────────────────────────────── */
function Nav() {
  const { scrollY } = useScroll();
  const bg = useTransform(scrollY, [0, 80], ["rgba(240,242,238,0)", "rgba(240,242,238,0.97)"]);
  const shadow = useTransform(scrollY, [0, 80], ["none", "0 2px 32px -4px rgba(13,51,32,0.12)"]);

  return (
    <motion.header style={{ backgroundColor: bg, boxShadow: shadow }}
      className="fixed top-0 inset-x-0 z-50 backdrop-blur-md">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3 group">
          {/* Diamond icon */}
          <div className="relative h-8 w-8 flex-shrink-0">
            <div className="absolute inset-0 bg-[#0D3320] group-hover:scale-110 transition-transform duration-300"
              style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
            <div className="absolute inset-[35%] bg-[#FF4D00] rounded-full" />
          </div>
          <span className="font-headline text-[28px] text-[#0D3320] tracking-wider leading-none">ONSIDE</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {[["#method", "The Method"], ["#track", "Track Record"], ["#comps", "Competitions"]].map(([href, label]) => (
            <a key={href} href={href}
              className="font-label text-[12px] font-semibold uppercase tracking-[0.2em] text-[#0D3320]/50 hover:text-[#0D3320] transition-colors duration-200">
              {label}
            </a>
          ))}
        </nav>

        <Link href="/login"
          className="font-label text-[12px] font-bold uppercase tracking-widest bg-[#0D3320] text-white px-6 py-2.5 rounded-full hover:bg-[#FF4D00] transition-all duration-300">
          Sign In
        </Link>
      </div>
    </motion.header>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  HERO                                                   */
/* ──────────────────────────────────────────────────────── */
function Hero() {
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: 0.1 });
      tl.from(".hl-1", { yPercent: 110, duration: 0.9, ease: "power4.out" })
        .from(".hl-2", { yPercent: 110, duration: 0.9, ease: "power4.out" }, "-=0.7")
        .from(".hl-3", { yPercent: 110, duration: 0.9, ease: "power4.out" }, "-=0.7")
        .from(".hero-sub",  { y: 24, opacity: 0, duration: 0.7, ease: "power3.out" }, "-=0.4")
        .from(".hero-ctas", { y: 20, opacity: 0, duration: 0.6, ease: "power3.out" }, "-=0.4")
        .from(".hero-strip", { y: 12, opacity: 0, duration: 0.5, ease: "power2.out" }, "-=0.3")
        .from(".hero-card",  { x: 64, opacity: 0, duration: 1.0, ease: "power4.out" }, "<-0.5");

      // Parallax on scroll
      gsap.to(".hero-bg-pitch", {
        yPercent: 20,
        ease: "none",
        scrollTrigger: { trigger: containerRef.current, start: "top top", end: "bottom top", scrub: true },
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={containerRef} className="relative min-h-screen overflow-hidden">
      {/* LEFT HALF — deep forest green */}
      <div className="absolute inset-0 lg:w-[55%] bg-[#0D3320]" />
      {/* RIGHT HALF — pitch off-white */}
      <div className="absolute inset-0 left-auto lg:w-[45%] bg-[#F0F2EE]" />

      {/* Pitch SVG on green half */}
      <div className="hero-bg-pitch absolute inset-0 lg:w-[55%] flex items-center justify-center pointer-events-none">
        <PitchSVG className="w-full h-full text-white" opacity={0.08} />
      </div>

      {/* Ghost huge number behind left headline */}
      <div className="absolute bottom-0 left-0 pointer-events-none select-none overflow-hidden"
        style={{ width: "55%" }}>
        <span className="ghost-number-light" style={{ fontSize: "clamp(220px, 28vw, 400px)" }}>10</span>
      </div>

      {/* Content grid */}
      <div className="relative z-10 mx-auto max-w-7xl px-6 h-screen flex items-center">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-10 xl:gap-16 w-full items-center pt-20">

          {/* LEFT — Headline */}
          <div>
            {/* Badge */}
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
              className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/10 px-4 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FF4D00] animate-pulse" />
              <span className="font-label text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
                Dixon-Coles + SOT · La Liga &amp; UCL
              </span>
            </motion.div>

            {/* Headline */}
            <h1 className="font-headline leading-[0.88] tracking-tight overflow-hidden"
              style={{ fontSize: "clamp(72px, 9.5vw, 132px)" }}>
              <div className="overflow-hidden mb-1">
                <span className="hl-1 block text-white">THIS</span>
              </div>
              <div className="overflow-hidden mb-1">
                <span className="hl-2 block text-white">ISN'T A</span>
              </div>
              <div className="overflow-hidden">
                <span className="hl-3 block" style={{ color: "transparent", WebkitTextStroke: "2.5px #FF4D00" }}>
                  GUESS.
                </span>
              </div>
            </h1>

            {/* Horizontal rule with ember accent */}
            <div className="hero-sub mt-7 flex items-center gap-4 mb-6">
              <div className="h-px flex-1 bg-white/15" />
              <span className="font-label text-[11px] text-white/40 uppercase tracking-[0.25em]">It's a read.</span>
              <div className="h-px flex-1 bg-white/15" />
            </div>

            <p className="hero-sub max-w-lg text-[16px] leading-relaxed text-white/60 font-body font-medium">
              Real form, expected goals, injuries &amp; H2H — fed into a model backtested on 1,527 matches
              against bookmaker closing odds. Every number shows its reasoning.
            </p>

            <div className="hero-ctas mt-9 flex flex-wrap items-center gap-4">
              <Link href="/login"
                className="group inline-flex items-center gap-2 rounded-xl bg-[#FF4D00] px-7 py-4 font-label text-[13px] font-bold uppercase tracking-widest text-white transition-all duration-300 hover:bg-[#FF6B35] hover:-translate-y-0.5 shadow-lg hover:shadow-[0_16px_40px_-8px_rgba(255,77,0,0.45)]">
                Get My First Prediction
                <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
              </Link>
              <a href="#method"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-7 py-4 font-label text-[13px] font-bold uppercase tracking-widest text-white/70 transition-all duration-200 hover:border-white/50 hover:text-white">
                See the Method
              </a>
            </div>

            <div className="hero-strip mt-8 flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-[#FF4D00]" />
              <span className="font-label text-[10px] uppercase tracking-[0.2em] text-white/35">
                Every prediction ships with a confidence band — we don't pretend to be certain.
              </span>
            </div>
          </div>

          {/* RIGHT — Match card on off-white side */}
          <div className="hero-card relative flex justify-center">
            <MatchCentre />
          </div>
        </div>
      </div>

      {/* Diagonal cut at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-[#F0F2EE]"
        style={{ clipPath: "polygon(0 60%, 100% 0, 100% 100%, 0 100%)" }} />
    </section>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  TICKER                                                 */
/* ──────────────────────────────────────────────────────── */
function Ticker() {
  const items = [...TICKER, ...TICKER, ...TICKER];
  return (
    <div className="relative bg-[#FF4D00] py-3.5 overflow-hidden border-y-4 border-[#0D3320]">
      {/* Background text texture */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.06] pointer-events-none">
        <span className="font-headline text-[120px] text-white whitespace-nowrap">FULL TIME RESULTS</span>
      </div>
      <div className="flex w-max animate-ticker items-center">
        {items.map((item, i) => (
          <span key={i} className="font-label text-[13px] font-bold uppercase tracking-[0.22em] text-white px-8">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  SCROLL REVEAL                                          */
/* ──────────────────────────────────────────────────────── */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-70px" });
  return (
    <motion.div ref={ref} className={className}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.75, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

function STag({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 mb-5">
      <span className="text-[#FF4D00] font-label text-sm">◆</span>
      <span className="font-label text-[11px] font-bold uppercase tracking-[0.25em] text-[#0D3320]/45">{children}</span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  THE METHOD                                             */
/* ──────────────────────────────────────────────────────── */
const METHOD_CARDS = [
  { tag: "01", label: "FORM", title: "Current Form", desc: "Last 6 matches · xWpts weighted", note: "recency ξ = 0.004",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  { tag: "02", label: "xG", title: "Expected Goals", desc: "xG for/against · home & away split", note: "mu · λ (Dixon-Coles)",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg> },
  { tag: "03", label: "OUT", title: "Availability", desc: "Injuries & suspensions tracked", note: "squad delta applied",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { tag: "04", label: "H2H", title: "Head-to-Head", desc: "Historical matchup band analysis", note: "tight-score lean",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> },
];

function Method() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".method-card", {
        y: 48, opacity: 0, duration: 0.8, stagger: 0.1, ease: "power3.out",
        scrollTrigger: { trigger: ".method-card", start: "top 82%", toggleActions: "play none none none" },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section id="method" ref={sectionRef} className="scroll-mt-16 relative bg-white py-24 lg:py-36 overflow-hidden">
      {/* Ghost huge number behind */}
      <div className="absolute -right-8 top-0 pointer-events-none select-none">
        <span className="ghost-number" style={{ fontSize: "clamp(200px, 25vw, 360px)" }}>xG</span>
      </div>

      <div className="relative mx-auto max-w-7xl px-6">
        <Reveal>
          <STag>The Method</STag>
          <h2 className="font-headline leading-[0.88] text-[#0D3320]"
            style={{ fontSize: "clamp(56px, 7.5vw, 108px)" }}>
            WHY THIS
            <br />
            PREDICTION?
            <br />
            <span style={{ color: "#FF4D00" }}>WE CAN SHOW YOU.</span>
          </h2>
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-[#0D3320]/55">
            Transparency is the product. Every number traces back to inputs you can inspect — no black box, no hand-waving.
          </p>
        </Reveal>

        {/* 4 cards */}
        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {METHOD_CARDS.map((c, i) => (
            <Reveal key={c.tag} delay={0.05 + i * 0.07}>
              <div className="method-card group h-full rounded-2xl bg-[#F0F2EE] border border-[#0D3320]/08 p-6 hover:bg-[#0D3320] hover:border-transparent transition-all duration-400 cursor-default card-lift">
                <div className="mb-5 flex items-start justify-between">
                  <span className="font-label text-[11px] font-bold uppercase tracking-widest text-[#FF4D00] bg-[#FF4D00]/10 px-2.5 py-1 rounded-md group-hover:bg-white/10">
                    {c.label}
                  </span>
                  <span className="font-label text-[10px] text-[#0D3320]/25 group-hover:text-white/25 tabular-nums">{c.tag}</span>
                </div>
                <div className="text-[#0D3320]/30 group-hover:text-[#FF4D00] transition-colors duration-300 mb-4">
                  {c.icon}
                </div>
                <h3 className="font-headline text-3xl text-[#0D3320] group-hover:text-white leading-tight mb-2 transition-colors">{c.title}</h3>
                <p className="text-sm text-[#0D3320]/55 group-hover:text-white/55 leading-relaxed transition-colors">{c.desc}</p>
                <p className="mt-3 font-label text-[10px] text-[#0D3320]/30 group-hover:text-white/30 tracking-widest transition-colors">{c.note}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Model banner */}
        <Reveal delay={0.12}>
          <div className="mt-6 rounded-2xl border-2 border-[#0D3320] bg-[#0D3320] px-7 py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-headline text-2xl text-white">DIXON-COLES + POISSON</p>
                <p className="text-sm text-white/50 mt-1">
                  Scoring model calibrated on 1,527 real matches — blended with a recency-aware SOT layer.
                </p>
              </div>
              <span className="rounded-xl bg-[#FF4D00] px-5 py-2.5 font-label text-[12px] font-bold uppercase tracking-widest text-white">
                Fit → Predict
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  TRACK RECORD                                           */
/* ──────────────────────────────────────────────────────── */
const STATS = [
  { value: "50.3", suffix: "%", label: "Calibration Accuracy", desc: "vs spread of our own probabilities", accent: "#0D3320" },
  { value: "1.022", suffix: "", label: "Log-Loss Score", desc: "lower is better — stable out-of-sample", accent: "#0D3320" },
  { value: "52.4", suffix: "%", label: "Bookmaker Benchmark", desc: "the house — the bar we chase", accent: "#FF4D00" },
  { value: "1527", suffix: "", label: "Matches Fitted", desc: "Dixon-Coles + SOT blend w=0.4", accent: "#0D3320" },
];

function TrackRecord() {
  return (
    <section id="track" className="scroll-mt-16 bg-[#0D3320] py-24 lg:py-36 relative overflow-hidden"
      style={{ clipPath: "polygon(0 3%, 100% 0, 100% 97%, 0 100%)" }}>
      {/* Pitch SVG decoration */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <PitchSVG className="w-full h-full text-white max-w-5xl" opacity={0.05} />
      </div>
      {/* Ghost number */}
      <div className="absolute -left-4 top-0 pointer-events-none select-none">
        <span className="ghost-number-light" style={{ fontSize: "clamp(180px, 22vw, 320px)" }}>90</span>
      </div>

      <div className="relative mx-auto max-w-7xl px-6 pt-8">
        <Reveal>
          <STag>The Receipts</STag>
          <h2 className="font-headline leading-[0.88] text-white"
            style={{ fontSize: "clamp(56px, 7.5vw, 108px)" }}>
            WE SHOW
            <br />
            ACCURACY,
            <br />
            <span style={{ color: "transparent", WebkitTextStroke: "2px #FF4D00" }}>NOT JUST CONFIDENCE.</span>
          </h2>
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-white/50">
            A confidence score is worthless if you never check it against reality. We backtest against
            bookmaker closing odds — and publish the result, win or lose.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={0.06 + i * 0.07}>
              <div className="rounded-2xl bg-white/05 border border-white/10 p-7 hover:bg-white/08 transition-colors duration-300 relative overflow-hidden">
                <div className="absolute -right-2 -bottom-4 opacity-[0.04] pointer-events-none">
                  <span className="font-headline" style={{ fontSize: "88px" }}>{i + 1}</span>
                </div>
                <div className="font-headline" style={{ fontSize: "clamp(52px, 6vw, 76px)", lineHeight: 1, color: s.accent === "#FF4D00" ? "#FF4D00" : "white" }}>
                  <CountUp value={s.value} suffix={s.suffix} color={s.accent === "#FF4D00" ? "#FF4D00" : "white"} />
                </div>
                <p className="mt-3 font-label text-[12px] font-bold uppercase tracking-wide text-white/60">{s.label}</p>
                <p className="mt-1 text-sm text-white/35 leading-snug">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.14}>
          <p className="mt-10 max-w-3xl text-sm leading-relaxed text-white/35 pb-8">
            Honest framing: beating bookmakers long-term is hard — which is exactly why we publish
            the comparison instead of hiding it. Our edge is transparency and discipline, not certainty.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  COMPETITIONS                                           */
/* ──────────────────────────────────────────────────────── */
function Competitions() {
  return (
    <section id="comps" className="scroll-mt-16 bg-white py-24 lg:py-36 relative overflow-hidden">
      {/* Ghost number */}
      <div className="absolute -right-4 bottom-0 pointer-events-none select-none">
        <span className="ghost-number" style={{ fontSize: "clamp(180px, 22vw, 320px)" }}>11</span>
      </div>

      <div className="relative mx-auto max-w-7xl px-6">
        <Reveal>
          <STag>Where We Live</STag>
          <h2 className="font-headline leading-[0.88] text-[#0D3320]"
            style={{ fontSize: "clamp(56px, 7.5vw, 108px)" }}>
            TWO
            <br />
            COMPETITIONS.
            <br />
            <span style={{ color: "#FF4D00" }}>TRACKED OBSESSIVELY.</span>
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-6 md:grid-cols-2">
          {/* La Liga */}
          <Reveal delay={0.08}>
            <div className="group relative overflow-hidden rounded-3xl bg-[#0D3320] min-h-[440px] flex flex-col justify-between p-10 card-lift cursor-default">
              {/* Pitch lines overlay */}
              <PitchSVG className="absolute inset-0 w-full h-full text-white" opacity={0.06} />
              {/* Corner graphic */}
              <div className="absolute -bottom-28 -right-28 h-72 w-72 rounded-full border-2 border-white/10" />
              <div className="absolute -bottom-20 -right-20 h-52 w-52 rounded-full border border-white/06" />
              {/* Ember glow on hover */}
              <div className="absolute inset-0 bg-[#FF4D00] opacity-0 group-hover:opacity-[0.04] transition-opacity duration-500 rounded-3xl" />

              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 mb-7">
                  <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
                  <span className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-white/60">Spain · Top Flight</span>
                </div>
                <h3 className="font-headline text-[80px] leading-[0.85] text-white tracking-tight">LA<br />LIGA</h3>
                <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-white/50">
                  Every matchday tracked. Form curves, xG trajectories and injury deltas across all 380 fixtures — zero guesswork.
                </p>
              </div>

              <div className="relative flex items-end justify-between">
                <span className="font-label text-[11px] tracking-widest text-[#22c55e]/60 uppercase">380 Fixtures · 2026/27</span>
                <div className="font-headline text-[72px] text-white/08 leading-none">LA</div>
              </div>
            </div>
          </Reveal>

          {/* UCL */}
          <Reveal delay={0.15}>
            <div className="group relative overflow-hidden rounded-3xl bg-[#060D20] min-h-[440px] flex flex-col justify-between p-10 card-lift cursor-default">
              {/* Star dot pattern */}
              <div className="absolute inset-0 opacity-[0.08]"
                style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
              {/* Blue glow */}
              <div className="absolute -top-20 right-0 h-80 w-80 rounded-full pointer-events-none"
                style={{ background: "radial-gradient(closest-side, rgba(56,189,248,0.20), transparent 70%)" }} />
              <div className="absolute inset-0 bg-[#38bdf8] opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500 rounded-3xl" />

              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 mb-7">
                  <span className="h-2 w-2 rounded-full bg-[#38bdf8]" />
                  <span className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-white/60">Europe · Champions</span>
                </div>
                <h3 className="font-headline text-[68px] leading-[0.85] text-white tracking-tight">UEFA<br />CHAMPIONS<br />LEAGUE</h3>
                <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-white/45">
                  The knockout moments where one read separates clarity from panic. League phase through to the final.
                </p>
              </div>

              <div className="relative flex items-end justify-between">
                <span className="font-label text-[11px] tracking-widest text-[#38bdf8]/60 uppercase">League Phase → Final</span>
                <div className="font-headline text-[72px] text-white/08 leading-none">UCL</div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  CTA BANNER                                             */
/* ──────────────────────────────────────────────────────── */
function CTABanner() {
  return (
    <section className="relative bg-[#FF4D00] py-24 lg:py-32 overflow-hidden"
      style={{ clipPath: "polygon(0 4%, 100% 0, 100% 100%, 0 100%)" }}>
      {/* Ghost text decoration */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.07]">
        <span className="font-headline text-white whitespace-nowrap" style={{ fontSize: "clamp(80px, 12vw, 180px)" }}>
          ONSIDE ONSIDE ONSIDE
        </span>
      </div>
      {/* Diagonal stripe accents */}
      <div className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: "repeating-linear-gradient(-45deg, white 0, white 2px, transparent 2px, transparent 32px)" }} />

      <div className="relative mx-auto max-w-5xl px-6 text-center pt-8">
        <Reveal>
          <h2 className="font-headline leading-[0.88] text-white"
            style={{ fontSize: "clamp(60px, 8.5vw, 116px)" }}>
            SEE THE READ<br />BEFORE YOU<br />
            <span style={{ color: "transparent", WebkitTextStroke: "2.5px white" }}>PLACE ANYTHING.</span>
          </h2>
          <p className="mx-auto mt-7 max-w-xl text-[17px] leading-relaxed text-white/65">
            Your first prediction is free. We'll show you the numbers, the confidence band
            and the reasoning — then you decide.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/login"
              className="group inline-flex items-center gap-2 rounded-xl bg-[#0D3320] px-8 py-4 font-label text-[13px] font-bold uppercase tracking-widest text-white transition-all duration-300 hover:bg-[#0f2d1f] hover:-translate-y-0.5 shadow-xl hover:shadow-[0_20px_48px_-8px_rgba(13,51,32,0.5)]">
              Get My First Prediction
              <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </Link>
            <a href="#method"
              className="inline-flex items-center gap-2 rounded-xl border-2 border-white/30 px-8 py-4 font-label text-[13px] font-bold uppercase tracking-widest text-white/80 transition-all duration-200 hover:border-white hover:text-white">
              Revisit the Method
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  FOOTER                                                 */
/* ──────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="bg-[#0A1A10] px-6 py-10">
      <div className="mx-auto max-w-7xl flex flex-col items-center justify-between gap-4 sm:flex-row">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="h-6 w-6 bg-[#FF4D00] flex-shrink-0"
            style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
          <span className="font-headline text-xl text-white tracking-wider">ONSIDE</span>
        </Link>
        <p className="text-xs text-white/30 text-center font-body">
          Probability, not certainty. La Liga + UEFA Champions League.
        </p>
        <span className="font-label text-[10px] uppercase tracking-widest text-white/20">
          © {new Date().getFullYear()} Onside
        </span>
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
      <Ticker />
      <Method />
      <TrackRecord />
      <Competitions />
      <CTABanner />
      <Footer />
    </main>
  );
}
