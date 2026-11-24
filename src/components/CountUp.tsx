"use client";
import { useEffect, useState } from "react";

/** Number that counts up smoothly when it appears (skipped if the user prefers reduced motion). */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [n, setN] = useState(value);
  useEffect(() => {
    if (typeof window === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) { setN(value); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setN(0); raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{n}</>;
}
