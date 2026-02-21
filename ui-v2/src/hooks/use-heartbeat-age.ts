import { useState, useEffect } from "react";
import { timeAgo } from "@/lib/format";

export function useHeartbeatAge(lastHeartbeatAtMs: number | null | undefined): {
  label: string;
  stale: boolean;
} {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!lastHeartbeatAtMs) {
    return { label: "never", stale: true };
  }

  const ageMs = Date.now() - lastHeartbeatAtMs;
  const stale = ageMs > 60_000;
  return { label: timeAgo(lastHeartbeatAtMs), stale };
}
