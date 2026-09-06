"use client";

import Link from "next/link";

/**
 * ONSIDE brand lockup — diamond badge + wordmark.
 * Motion-driven hover states (CSS, no layout shift).
 */
export function Brand({ href = "/", size = "md" }: { href?: string; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-9 w-9" : "h-7 w-7";
  const text = size === "lg" ? "text-[30px]" : "text-[23px]";
  const dot = size === "lg" ? "inset-[37%]" : "inset-[35%]";

  return (
    <Link href={href} className="group flex items-center gap-2.5">
      <span className={`relative ${box} flex-shrink-0`}>
        <span
          className="absolute inset-0 bg-chalk transition-transform duration-300 group-hover:scale-110"
          style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }}
        />
        <span className={`absolute ${dot} rounded-full bg-ember transition-colors duration-300 group-hover:bg-leaf`} />
      </span>
      <span className={`${text} font-display leading-none tracking-[0.14em] text-chalk`}>
        ONSIDE
      </span>
    </Link>
  );
}