"use client";

import { useEffect, useId, useState } from "react";
import { FIELD_ART } from "@/lib/field-art";

export type PositionKey =
  "LF" | "CF" | "RF" | "P" | "1B" | "2B" | "SS" | "3B" | "C";
export type TapState = "correct" | "wrong" | null;

export const FIELD_POS: Record<
  PositionKey,
  { x: number; y: number; label: string }
> = {
  LF: { x: 80, y: 58, label: "LF" },
  CF: { x: 200, y: 26, label: "CF" },
  RF: { x: 320, y: 58, label: "RF" },
  SS: { x: 122, y: 158, label: "SS" },
  "2B": { x: 278, y: 158, label: "2B" },
  "1B": { x: 366, y: 196, label: "1B" },
  "3B": { x: 34, y: 196, label: "3B" },
  P: { x: 200, y: 210, label: "P" },
  C: { x: 200, y: 350, label: "C" },
};

// Position-group color coding (battery / infield / outfield) — same idea Dugout
// Master uses, picked to not collide with the game's own green=correct,
// red=wrong, gold=ball feedback colors.
const BATTERY_FILL = "#ffffff";
const BATTERY_STROKE = "#536958";
const INFIELD_FILL = "#ffffff";
const INFIELD_STROKE = "#536958";
const OUTFIELD_FILL = "#ffffff";
const OUTFIELD_STROKE = "#536958";

export const POSITION_GROUP_FILL: Record<PositionKey, string> = {
  P: BATTERY_FILL,
  C: BATTERY_FILL,
  "1B": INFIELD_FILL,
  "2B": INFIELD_FILL,
  "3B": INFIELD_FILL,
  SS: INFIELD_FILL,
  LF: OUTFIELD_FILL,
  CF: OUTFIELD_FILL,
  RF: OUTFIELD_FILL,
};

export const POSITION_GROUP_STROKE: Record<PositionKey, string> = {
  P: BATTERY_STROKE,
  C: BATTERY_STROKE,
  "1B": INFIELD_STROKE,
  "2B": INFIELD_STROKE,
  "3B": INFIELD_STROKE,
  SS: INFIELD_STROKE,
  LF: OUTFIELD_STROKE,
  CF: OUTFIELD_STROKE,
  RF: OUTFIELD_STROKE,
};

export const BASES = {
  home: { x: 200, y: 320 },
  first: { x: 318, y: 198 },
  second: { x: 200, y: 90 },
  third: { x: 82, y: 198 },
};

/** A quadratic path between two points, gently bowed off the straight line. */
function bowedPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const bow = Math.min(dist * 0.28, 46);
  const ctrlX = (from.x + to.x) / 2 - (dy / dist) * bow;
  const ctrlY = (from.y + to.y) / 2 + (dx / dist) * bow;
  return `M ${from.x},${from.y} Q ${ctrlX},${ctrlY} ${to.x},${to.y}`;
}

export function Diamond({
  runners,
  ballZone,
  targetZone,
  tappedZone,
  tapState,
  onTap,
  interactive,
  showRelay = true,
}: {
  runners: { first: boolean; second: boolean; third: boolean };
  ballZone: string;
  targetZone?: string;
  tappedZone?: string | null;
  tapState?: TapState;
  onTap?: (zone: string) => void;
  interactive?: boolean;
  // Does the ball actually travel on to targetZone once the answer is revealed?
  // False for scenarios where targetZone is a backup/standby role the ball never
  // reaches (see BackupScenario.ballReachesTarget) — no second hop is shown then.
  showRelay?: boolean;
}) {
  const fieldId = useId();
  // Brief "ball in flight" beat before the ball-zone marker settles in —
  // makes each scenario feel like something just happened, not a static diagram.
  const [landed, setLanded] = useState(tapState !== null);
  useEffect(() => {
    if (tapState !== null) {
      setLanded(true);
      return;
    }
    setLanded(false);
    const t = setTimeout(() => setLanded(true), 520);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ballZone, targetZone]);

  // Second hop: once the answer is revealed, show the ball actually completing
  // its real path from ballZone to targetZone (the correct fielder) — reinforces
  // the lesson instead of just instantly lighting up the right circle.
  const canRelay = showRelay && !!targetZone && targetZone !== ballZone;
  const [relayLanded, setRelayLanded] = useState(
    tapState !== null || !canRelay,
  );
  useEffect(() => {
    if (tapState === null || !canRelay) {
      setRelayLanded(!canRelay);
      return;
    }
    setRelayLanded(false);
    const t = setTimeout(() => setRelayLanded(true), 420);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tapState]);

  const ballPos = ballZone ? FIELD_POS[ballZone as PositionKey] : undefined;
  const targetPos = targetZone
    ? FIELD_POS[targetZone as PositionKey]
    : undefined;

  let hitPath: string | undefined;
  if (ballPos && !landed) {
    hitPath = bowedPath(BASES.home, ballPos);
  }

  let relayPath: string | undefined;
  if (canRelay && ballPos && targetPos && !relayLanded) {
    relayPath = bowedPath(ballPos, targetPos);
  }

  return (
    <svg
      viewBox="0 0 400 390"
      className="w-full max-w-sm mx-auto"
      aria-label="Baseball field — choose a player position"
    >
      <defs>
        <clipPath id={`${fieldId}-clip`}>
          <rect width="400" height="390" rx="18" />
        </clipPath>
      </defs>
      {/* Same field artwork as coach scoring. Fixed crop keeps overlays aligned. */}
      <image
        href={FIELD_ART}
        x="0"
        y="0"
        width="400"
        height="390"
        preserveAspectRatio="xMidYMid slice"
        clipPath={`url(#${fieldId}-clip)`}
      />
      <rect width="400" height="390" rx="18" fill="#102c20" opacity="0.12" />
      {/* Runners sit on the actual base, separate from player tap targets. */}
      {[
        { pos: BASES.first, occupied: runners.first, label: "1" },
        { pos: BASES.second, occupied: runners.second, label: "2" },
        { pos: BASES.third, occupied: runners.third, label: "3" },
      ].map(({ pos, occupied, label }) =>
        occupied ? (
          <g key={label} aria-label={`Runner on base ${label}`}>
            <rect
              x={pos.x - 11}
              y={pos.y - 11}
              width="22"
              height="22"
              rx="5"
              fill="#b74720"
              stroke="white"
              strokeWidth="2"
            />
            <text
              x={pos.x}
              y={pos.y + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="11"
              fontWeight="800"
              fill="white"
            >
              {label}
            </text>
          </g>
        ) : null,
      )}

      {/* ── Fielder position circles ── */}
      {Object.entries(FIELD_POS).map(([key, pos]) => {
        const isBall = key === ballZone;
        // Correct-target reveal waits for the relay ball to "arrive" (when a
        // second hop applies) instead of snapping green the instant they tap.
        const isTarget = tapState !== null && key === targetZone && relayLanded;
        const isWrong =
          tappedZone === key && tapState === "wrong" && key !== targetZone;

        let circleFill = POSITION_GROUP_FILL[key as PositionKey];
        let circleStroke = POSITION_GROUP_STROKE[key as PositionKey];
        let textFill = "#193e30";

        if (isBall && tapState === null && landed) {
          circleFill = "#f4c180";
          circleStroke = "#a66520";
          textFill = "#0f2044";
        } else if (isTarget) {
          circleFill = "#16a34a";
          circleStroke = "#22c55e";
          textFill = "white";
        } else if (isWrong) {
          textFill = "white";
          circleFill = "#a73535";
          circleStroke = "#ef4444";
        } else if (tapState !== null && isBall) {
          circleFill = "#c8a020";
          circleStroke = "#e8c840";
          textFill = "#0f2044";
        }

        const canTap = interactive && tapState === null;

        return (
          <g key={key}>
            {/* BALL label pill under the ball zone */}
            {isBall && landed && (
              <g style={{ pointerEvents: "none" }}>
                <rect
                  x={pos.x - 21}
                  y={pos.y + 24}
                  width={42}
                  height={15}
                  rx={7.5}
                  fill="#f4c180"
                />
                <text
                  x={pos.x}
                  y={pos.y + 34.5}
                  textAnchor="middle"
                  fontSize={8.5}
                  fontWeight="900"
                  fill="#0f2044"
                  style={{ letterSpacing: "0.1em" }}
                >
                  BALL
                </text>
              </g>
            )}

            {/* Keyboard and touch share one generously sized target. */}
            <rect
              x={pos.x - 24}
              y={pos.y - 23}
              width={48}
              height={46}
              rx={12}
              fill={circleFill}
              stroke={circleStroke}
              strokeWidth={2}
              role={canTap ? "button" : undefined}
              tabIndex={canTap ? 0 : undefined}
              aria-label={`${pos.label}${isBall ? ", ball here" : ""}${isTarget ? ", correct answer" : ""}${isWrong ? ", try again" : ""}`}
              className={
                canTap ? "training-player-target cursor-pointer" : undefined
              }
              onClick={canTap ? () => onTap?.(key) : undefined}
              onKeyDown={
                canTap
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onTap?.(key);
                      }
                    }
                  : undefined
              }
            />

            {/* Position label */}
            <text
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={13}
              fontWeight="800"
              fill={textFill}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {pos.label}
            </text>

            {/* ✓ on correct answer */}
            {isTarget && (
              <text
                x={pos.x + 16}
                y={pos.y - 16}
                fontSize={15}
                fontWeight="bold"
                fill="#22c55e"
                style={{ pointerEvents: "none" }}
              >
                ✓
              </text>
            )}

            {/* ✗ on wrong tap */}
            {isWrong && (
              <text
                x={pos.x + 16}
                y={pos.y - 16}
                fontSize={15}
                fontWeight="bold"
                fill="#ef4444"
                style={{ pointerEvents: "none" }}
              >
                ✗
              </text>
            )}
          </g>
        );
      })}

      {/* ── Ball-in-flight: travels from home to the play, then "lands" ── */}
      {hitPath && ballPos && (
        <g style={{ pointerEvents: "none" }}>
          <circle r={5} fill="#fdf6e3" stroke="#8a5a20" strokeWidth={1.2}>
            <animateMotion
              path={hitPath}
              dur="0.5s"
              fill="freeze"
              calcMode="spline"
              keySplines="0.25 0.1 0.6 1"
              keyTimes="0;1"
            />
            <animate
              attributeName="opacity"
              values="1;1;0"
              keyTimes="0;0.92;1"
              dur="0.5s"
              fill="freeze"
            />
          </circle>
          <circle
            cx={ballPos.x}
            cy={ballPos.y}
            r={2}
            fill="none"
            stroke="#a66520"
            strokeWidth={3}
            opacity={0}
          >
            <animate
              attributeName="r"
              values="2;24"
              begin="0.42s"
              dur="0.35s"
              fill="freeze"
            />
            <animate
              attributeName="opacity"
              values="0.9;0"
              begin="0.42s"
              dur="0.35s"
              fill="freeze"
            />
          </circle>
        </g>
      )}

      {/* ── Relay: after the tap, the ball completes its real path to the correct fielder ── */}
      {relayPath && targetPos && (
        <g style={{ pointerEvents: "none" }}>
          <circle r={5} fill="#fdf6e3" stroke="#8a5a20" strokeWidth={1.2}>
            <animateMotion
              path={relayPath}
              dur="0.4s"
              fill="freeze"
              calcMode="spline"
              keySplines="0.25 0.1 0.6 1"
              keyTimes="0;1"
            />
            <animate
              attributeName="opacity"
              values="1;1;0"
              keyTimes="0;0.9;1"
              dur="0.4s"
              fill="freeze"
            />
          </circle>
          <circle
            cx={targetPos.x}
            cy={targetPos.y}
            r={2}
            fill="none"
            stroke="#22c55e"
            strokeWidth={3}
            opacity={0}
          >
            <animate
              attributeName="r"
              values="2;22"
              begin="0.34s"
              dur="0.3s"
              fill="freeze"
            />
            <animate
              attributeName="opacity"
              values="0.9;0"
              begin="0.34s"
              dur="0.3s"
              fill="freeze"
            />
          </circle>
        </g>
      )}

      {/* Runner legend */}
      {(runners.first || runners.second || runners.third) && (
        <>
          <circle
            cx={14}
            cy={376}
            r={6}
            fill="#b74720"
            stroke="white"
            strokeWidth={1.5}
          />
          <text
            x={24}
            y={381}
            fontSize={10}
            fill="white"
            style={{ userSelect: "none" }}
          >
            = runner on base
          </text>
        </>
      )}
    </svg>
  );
}
