import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { moduleForPath, type ClientEventVerb } from "@gtb/shared";
import { authedFetch } from "./api";
import { env } from "./env";

/**
 * Staff app heartbeat and activity events (Team Pulse, TEAM_PULSE_DESIGN.md
 * §5.5). Silent: no UI, never blocks anything, failures are ignored.
 */

/** Input within this window keeps the person "active" (reading counts). */
const GRACE_MS = 3 * 60_000;
/** How often to check whether the current minute still needs a beat. */
const CHECK_MS = 10_000;
const INPUT_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"] as const;

function post(path: string, body: unknown): Promise<unknown> {
  return authedFetch(`${env.apiUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * One beat per wall-clock minute while the tab is visible and there was real
 * input in the last 3 minutes. The first input after a quiet spell beats
 * immediately, so the start of the day is exact to the second.
 */
export function useHeartbeat(enabled: boolean): void {
  const { pathname } = useLocation();
  const moduleRef = useRef(moduleForPath(pathname));
  moduleRef.current = moduleForPath(pathname);

  useEffect(() => {
    if (!enabled) return;
    let lastInput = 0;
    let lastMinute = -1;

    const beat = () => {
      const now = Date.now();
      const minute = Math.floor(now / 60_000);
      if (minute === lastMinute) return;
      if (document.visibilityState !== "visible" || now - lastInput > GRACE_MS) return;
      lastMinute = minute;
      void post("/api/heartbeat", { module: moduleRef.current });
    };
    const onInput = () => {
      lastInput = Date.now();
      beat();
    };

    for (const e of INPUT_EVENTS) window.addEventListener(e, onInput, { passive: true, capture: true });
    const timer = window.setInterval(beat, CHECK_MS);
    return () => {
      for (const e of INPUT_EVENTS) window.removeEventListener(e, onInput, { capture: true });
      window.clearInterval(timer);
    };
  }, [enabled]);
}

type ActivityEvent =
  | { verb: Extract<ClientEventVerb, "client.viewed">; entityId: string }
  | { verb: Extract<ClientEventVerb, "report.exported">; report: string; rows: number }
  | { verb: Extract<ClientEventVerb, "auth.signed_out"> };

/** Fire-and-forget activity event; the server ignores callers it doesn't track. */
export function sendActivityEvent(event: ActivityEvent): Promise<unknown> {
  return post("/api/events", event);
}
