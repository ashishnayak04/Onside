"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion, useInView, useMotionValue, useSpring } from "framer-motion";

/**
 * Spring count-up for telemetry numerals. Renders the same value
 * ("0"+suffix) on server and client to keep hydration identical.
 */
export function CountUp({
  value,
  suffix = "",
  className,
  start = true,
}: {
  value: string;
  suffix?: string;
  className?: string;
  start?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const num = parseFloat(value);
  const dec = value.includes(".") ? value.split(".")[1].length : 0;
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 50, damping: 16, mass: 0.8 });

  useEffect(() => {
    if (inView && start) mv.set(num);
  }, [inView, mv, num, start]);

  useEffect(
    () =>
      spring.on("change", (v) => {
        if (ref.current) {
          const fmt = v.toLocaleString("en-US", {
            minimumFractionDigits: dec,
            maximumFractionDigits: dec,
          });
          ref.current.textContent = fmt + suffix;
        }
      }),
    [spring, dec, suffix]
  );

  return (
    <span ref={ref} className={className}>
      {"0" + suffix}
    </span>
  );
}

/** Used when a numeral must also animate width/intro. */
export function CountUpWrapper({ children }: { children: ReactNode }) {
  return <motion.span>{children}</motion.span>;
}