import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

import { Brand } from "./Brand";

export function AuthShell({
  children,
  photo,
  photoAlt,
  headline,
  sub,
  stat,
  badge,
}: {
  children: ReactNode;
  photo: string;
  photoAlt: string;
  headline: ReactNode;
  sub: string;
  stat: { value: string; label: string };
  badge: string;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-ink">
      <div className="pitch-lines pointer-events-none absolute inset-0 opacity-50"
        style={{ maskImage: "linear-gradient(180deg, black 0%, transparent 75%)", WebkitMaskImage: "linear-gradient(180deg, black 0%, transparent 75%)" }} />
      <div className="pointer-events-none absolute -top-40 right-0 h-[560px] w-[560px] rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(242,176,28,0.18), transparent 70%)" }} />
      <div className="pointer-events-none absolute bottom-0 left-[-1rem] select-none">
        <span className="ghost-number" style={{ fontSize: "clamp(160px, 20vw, 280px)" }}>90</span>
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <Brand size="lg" />

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          {/* LEFT — broadcast promo */}
          <div className="hidden lg:block">
            <div className="crop-marks relative overflow-hidden rounded-3xl border border-chalk/10">
              <div className="relative h-[540px]">
                <Image
                  src={photo}
                  alt={photoAlt}
                  fill
                  sizes="(max-width: 1024px) 100vw, 55vw"
                  className="object-cover object-center"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/15 to-transparent" />

                {/* broadcast overlays */}
                <div className="absolute left-4 top-4 flex items-center gap-2 rounded-md bg-[#0B0F0C]/70 px-2.5 py-1.5 backdrop-blur-sm">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="live-ping absolute inset-0 rounded-full bg-live" />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-live" />
                  </span>
                  <span className="font-label text-[9px] font-bold uppercase tracking-[0.22em] text-white">{badge}</span>
                </div>
                <div className="absolute right-4 top-4 rounded-md bg-[#0B0F0C]/70 px-2.5 py-1.5 font-label text-[9px] font-bold uppercase tracking-[0.22em] text-white backdrop-blur-sm">
                  RMA · MCI
                </div>

                {/* bottom copy */}
                <div className="absolute inset-x-0 bottom-0 p-8">
                  <h2 className="font-display leading-[0.9] tracking-tight text-chalk text-[clamp(38px,4.5vw,66px)]">
                    {headline}
                  </h2>
                  <p className="mt-4 max-w-md text-[14px] leading-relaxed text-chalk/70">{sub}</p>
                  <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-chalk/15 bg-[#0B0F0C]/40 px-4 py-2 backdrop-blur-sm">
                    <span className="font-display text-2xl text-ember tabular-nums">{stat.value}</span>
                    <span className="font-label text-[10px] uppercase tracking-widest text-chalk/60">{stat.label}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — form */}
          <div className="mx-auto w-full max-w-md">
            {children}
          </div>
        </div>

        <div className="flex items-center justify-between pb-2">
          <Link href="/" className="font-label text-[10px] uppercase tracking-[0.22em] text-stale transition-colors duration-200 hover:text-chalk">
            ← Back to site
          </Link>
          <p className="font-label text-[9px] uppercase tracking-wider text-stale/45">
            Photos: Wikimedia Commons (CC BY / CC BY-SA)
          </p>
        </div>
      </div>
    </main>
  );
}