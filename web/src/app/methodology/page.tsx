import Link from "next/link";

const INPUTS = [
  { k: "Form", d: "Last 6 matches, wins-weighted, with recency decay (ξ = 0.004) so older results weigh less." },
  { k: "Expected Goals", d: "xG for/against, split home and away, plus the match-level mu / λ used by the scoring model." },
  { k: "Availability", d: "Injuries and suspensions tracked, applied as a squad delta to attacking/defensive strength." },
  { k: "Head-to-Head", d: "Historical matchup band used to temper the draw probability on genuinely close fixtures." },
  { k: "Rest", d: "Days since last match for both sides — fatigue is real but small; it sits at the margin." },
];

const LIMITATIONS = [
  "Football is low-scoring and high-variance. A 70% favourite loses roughly three times out of ten.",
  "Probabilities reflect the model's belief given its inputs — not a guarantee, and not bookmaker odds.",
  "38–44 league matches of history per side is thin. The gap between model reality and model fiction is a known risk, which is why every prediction is scored against the actual result.",
  "Nothing on this site is betting advice.",
];

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-ink text-chalk">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="font-label text-[11px] uppercase tracking-[0.2em] text-stale hover:text-chalk">
          ← Back to site
        </Link>

        <p className="mb-3 mt-10 font-label text-[11px] font-bold uppercase tracking-[0.24em] text-ember">
          Onside · Methodology
        </p>
        <h1 className="font-display text-[clamp(40px,6vw,72px)] leading-[0.9] tracking-tight">
          HOW THE MODEL <br />
          MAKES A READ<span className="text-ember">.</span>
        </h1>

        <p className="mt-6 text-[15px] leading-relaxed text-stale">
          Every prediction on Onside is a probability produced by a Dixon-Coles scoring model blended
          with a recency-aware shot-oriented (SOT) layer. The current production model version is{" "}
          <code className="rounded bg-chalk/10 px-1.5 py-0.5 text-[13px] text-chalk">
            dc-sot-hybrid-w0.4-xi0.004-calib-v1
          </code>
          , and every prediction row stores the exact model version that produced it — nothing is retrofitted.
        </p>

        <h2 className="mb-4 mt-12 font-display text-3xl tracking-tight">Inputs</h2>
        <div className="space-y-3">
          {INPUTS.map((r) => (
            <div key={r.k} className="rounded-xl border border-chalk/10 bg-panel p-5">
              <p className="font-label text-[11px] font-bold uppercase tracking-widest text-ember">{r.k}</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-stale">{r.d}</p>
            </div>
          ))}
        </div>

        <h2 className="mb-4 mt-12 font-display text-3xl tracking-tight">Scoring</h2>
        <p className="text-[15px] leading-relaxed text-stale">
          Dixon-Coles models the goal distribution directly (both sides scored / draw-correction) and
          converts the expected (μ, λ) into home / draw / away probabilities. The SOT layer re-weights
          teams by shot totals and xG quality with a recency decay, so form matters more now than in
          August. A temperature calibration step then tunes probabilities against the model&apos;s own
          track record — the calibrated version is the one you see today.
        </p>

        <h2 className="mb-4 mt-12 font-display text-3xl tracking-tight">Track record</h2>
        <p className="text-[15px] leading-relaxed text-stale">
          Every published prediction is stored in the track record and scored against the actual result:
          the three-way probabilities, the chosen outcome, whether it was correct, and a Brier score.
          No prediction is silently deleted. As of the latest sync, 44 predictions have been scored —
          a small sample, shown plainly rather than hidden behind a bigger number.
        </p>

        <h2 className="mb-4 mt-12 font-display text-3xl tracking-tight">What these numbers are not</h2>
        <ul className="space-y-2.5">
          {LIMITATIONS.map((l) => (
            <li key={l} className="flex gap-3 text-[14px] leading-relaxed text-stale">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ember" />
              {l}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}