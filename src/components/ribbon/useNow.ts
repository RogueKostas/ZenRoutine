import { useEffect, useState } from 'react';

/** Milliseconds from `now` until the next whole `stepMs` boundary (never 0). */
export function msUntilNextTick(now: number, stepMs: number): number {
  const remainder = now % stepMs;
  return stepMs - remainder;
}

/**
 * The current time, refreshed on each whole `stepMs` (30s by default, so a per-minute marker
 * never lags by more than half a minute). The value is always read from the clock, so a tab
 * that was throttled in the background is right as soon as it ticks again.
 */
export function useNow(stepMs: number = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, msUntilNextTick(Date.now(), stepMs));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [stepMs]);
  return now;
}
