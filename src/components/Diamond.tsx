"use client";

import { useEffect, useState } from "react";

export type PositionKey = "LF" | "CF" | "RF" | "P" | "1B" | "2B" | "SS" | "3B" | "C";
export type TapState = "correct" | "wrong" | null;

export const FIELD_POS: Record<PositionKey, { x: number; y: number; label: string }> = {
  LF:  { x: 80,  y: 58,  label: "LF"  },
  CF:  { x: 200, y: 26,  label: "CF"  },
  RF:  { x: 320, y: 58,  label: "RF"  },
  SS:  { x: 122, y: 158, label: "SS"  },
  "2B":{ x: 278, y: 158, label: "2B"  },
  "1B":{ x: 366, y: 196, label: "1B"  },
  "3B":{ x: 34,  y: 196, label: "3B"  },
  P:   { x: 200, y: 210, label: "P"   },
  C:   { x: 200, y: 350, label: "C"   },
};

// Position-group color coding (battery / infield / outfield) — same idea Dugout
// Master uses, picked to not collide with the game's own green=correct,
// red=wrong, gold=ball feedback colors.
const BATTERY_FILL = "rgba(109,90,173,0.85)";
const BATTERY_STROKE = "rgba(160,140,215,0.9)";
const INFIELD_FILL = "rgba(38,135,160,0.85)";
const INFIELD_STROKE = "rgba(90,190,215,0.9)";
const OUTFIELD_FILL = "rgba(196,110,55,0.85)";
const OUTFIELD_STROKE = "rgba(230,155,95,0.9)";

export const POSITION_GROUP_FILL: Record<PositionKey, string> = {
  P: BATTERY_FILL, C: BATTERY_FILL,
  "1B": INFIELD_FILL, "2B": INFIELD_FILL, "3B": INFIELD_FILL, SS: INFIELD_FILL,
  LF: OUTFIELD_FILL, CF: OUTFIELD_FILL, RF: OUTFIELD_FILL,
};

export const POSITION_GROUP_STROKE: Record<PositionKey, string> = {
  P: BATTERY_STROKE, C: BATTERY_STROKE,
  "1B": INFIELD_STROKE, "2B": INFIELD_STROKE, "3B": INFIELD_STROKE, SS: INFIELD_STROKE,
  LF: OUTFIELD_STROKE, CF: OUTFIELD_STROKE, RF: OUTFIELD_STROKE,
};

export const BASES = {
  home:   { x: 200, y: 336 },
  first:  { x: 322, y: 212 },
  second: { x: 200, y: 88  },
  third:  { x: 78,  y: 212 },
};

export function Diamond({
  runners,
  ballZone,
  targetZone,
  tappedZone,
  tapState,
  onTap,
  interactive,
}: {
  runners: { first: boolean; second: boolean; third: boolean };
  ballZone: string;
  targetZone?: string;
  tappedZone?: string | null;
  tapState?: TapState;
  onTap?: (zone: string) => void;
  interactive?: boolean;
}) {
  // Brief "ball in flight" beat before the ball-zone marker settles in —
  // makes each scenario feel like something just happened, not a static diagram.
  const [landed, setLanded] = useState(tapState !== null);
  useEffect(() => {
    if (tapState !== null) { setLanded(true); return; }
    setLanded(false);
    const t = setTimeout(() => setLanded(true), 520);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ballZone, targetZone]);

  const ballPos = ballZone ? FIELD_POS[ballZone as PositionKey] : undefined;
  let hitPath: string | undefined;
  if (ballPos && !landed) {
    const homeX = BASES.home.x, homeY = BASES.home.y;
    const dx = ballPos.x - homeX, dy = ballPos.y - homeY;
    const dist = Math.hypot(dx, dy) || 1;
    const bow = Math.min(dist * 0.28, 46);
    const ctrlX = (homeX + ballPos.x) / 2 - (dy / dist) * bow;
    const ctrlY = (homeY + ballPos.y) / 2 + (dx / dist) * bow;
    hitPath = `M ${homeX},${homeY} Q ${ctrlX},${ctrlY} ${ballPos.x},${ballPos.y}`;
  }

  return (
    <svg
      viewBox="0 0 400 390"
      className="w-full max-w-sm mx-auto"
      aria-label="Baseball field — tap a player circle"
    >
      <defs>
        {/* Fair-territory clip — upward wedge + small catcher box below home */}
        <clipPath id="fair-clip">
          <path d="M 200,336 L 0,133 L 0,0 L 400,0 L 400,133 Z M 200,336 L 20,390 L 380,390 Z" />
        </clipPath>
        <filter id="glow-gold" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="glow-green" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="drop-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.35"/>
        </filter>
        {/* Mowed-lawn stripe pattern — vivid alternating greens, not a flat fill */}
        <pattern id="grass-stripes" width={40} height={400} patternUnits="userSpaceOnUse">
          <rect width={40} height={400} fill="#3a9146" />
          <rect width={20} height={400} fill="#4aa855" />
        </pattern>
        <pattern id="grass-stripes-foul" width={40} height={400} patternUnits="userSpaceOnUse">
          <rect width={40} height={400} fill="#2f7a3a" />
          <rect width={20} height={400} fill="#377f42" />
        </pattern>
      </defs>

      {/* ── 1. Foul territory base ── */}
      <rect width={400} height={390} rx={18} fill="url(#grass-stripes-foul)" />

      {/* ── 2. Fair territory ── */}
      <polygon points="200,336 0,133 0,0 400,0 400,133" fill="url(#grass-stripes)" />
      <polygon points="200,336 20,390 380,390" fill="url(#grass-stripes)" />

      {/* ── 3. Mowing arcs — centered at home, clipped to fair territory ── */}
      <g clipPath="url(#fair-clip)" opacity={0.9}>
        <circle cx={200} cy={336} r={240} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={16} />
        <circle cx={200} cy={336} r={300} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={16} />
        <circle cx={200} cy={336} r={360} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={16} />
      </g>

      {/* ── 4. Outfield wall arc ── */}
      <path d="M 0,133 Q 200,-28 400,133" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={3} />

      {/* ── 5. Foul lines ── */}
      <line x1={200} y1={336} x2={0} y2={133} stroke="rgba(255,255,255,0.75)" strokeWidth={2} />
      <line x1={200} y1={336} x2={400} y2={133} stroke="rgba(255,255,255,0.75)" strokeWidth={2} />

      {/* ── 6. Infield dirt circle (clipped to fair territory) ── */}
      <circle cx={200} cy={210} r={152} fill="#c9803f" clipPath="url(#fair-clip)" />

      {/* ── 7. Infield grass square ── */}
      <polygon points="200,96 314,212 200,328 86,212" fill="#3d9447" />

      {/* ── 8. Basepath chalk lines ── */}
      {[
        [BASES.home, BASES.first],
        [BASES.first, BASES.second],
        [BASES.second, BASES.third],
        [BASES.third, BASES.home],
      ].map(([a, b], i) => (
        <line
          key={i}
          x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke="rgba(255,255,255,0.80)"
          strokeWidth={2}
        />
      ))}

      {/* ── 9. Pitcher's mound ── */}
      <circle cx={200} cy={210} r={18} fill="#b5763a" />
      <rect x={194} y={207} width={12} height={6} rx={1.5} fill="#e8e8e8" opacity={0.85} />

      {/* ── Bases 1-3 ── */}
      {[
        { pos: BASES.first,  occ: runners.first  },
        { pos: BASES.second, occ: runners.second },
        { pos: BASES.third,  occ: runners.third  },
      ].map(({ pos, occ }, i) => (
        <rect
          key={i}
          x={pos.x - 10} y={pos.y - 10}
          width={20} height={20}
          transform={`rotate(45, ${pos.x}, ${pos.y})`}
          fill={occ ? "#ff4040" : "white"}
          stroke={occ ? "#cc2020" : "#ccc"}
          strokeWidth={1.5}
          filter="url(#drop-shadow)"
        />
      ))}

      {/* Runner indicator dots */}
      {runners.first  && <circle cx={BASES.first.x  + 18} cy={BASES.first.y  - 18} r={7} fill="#ff3333" stroke="white" strokeWidth={2} />}
      {runners.second && <circle cx={BASES.second.x + 18} cy={BASES.second.y - 18} r={7} fill="#ff3333" stroke="white" strokeWidth={2} />}
      {runners.third  && <circle cx={BASES.third.x  - 18} cy={BASES.third.y  - 18} r={7} fill="#ff3333" stroke="white" strokeWidth={2} />}

      {/* ── Home plate ── */}
      <polygon
        points={`
          ${BASES.home.x - 11},${BASES.home.y - 7}
          ${BASES.home.x + 11},${BASES.home.y - 7}
          ${BASES.home.x + 11},${BASES.home.y + 1}
          ${BASES.home.x},     ${BASES.home.y + 11}
          ${BASES.home.x - 11},${BASES.home.y + 1}
        `}
        fill="white"
        filter="url(#drop-shadow)"
      />

      {/* ── Fielder position circles ── */}
      {Object.entries(FIELD_POS).map(([key, pos]) => {
        const isBall    = key === ballZone;
        const isTarget  = tapState !== null && key === targetZone;
        const isWrong   = tappedZone === key && tapState === "wrong" && key !== targetZone;
        const isNeutral = !isBall && !isTarget && !isWrong;

        let circleFill   = POSITION_GROUP_FILL[key as PositionKey];
        let circleStroke = POSITION_GROUP_STROKE[key as PositionKey];
        let textFill     = "white";
        let glowFilter: string | undefined;

        if (isBall && tapState === null && landed) {
          circleFill   = "#e8b800";
          circleStroke = "#ffd60a";
          textFill     = "#0f2044";
          glowFilter   = "url(#glow-gold)";
        } else if (isTarget) {
          circleFill   = "#16a34a";
          circleStroke = "#22c55e";
          glowFilter   = "url(#glow-green)";
        } else if (isWrong) {
          circleFill   = "#dc2626";
          circleStroke = "#ef4444";
        } else if (tapState !== null && isBall) {
          circleFill   = "#c8a020";
          circleStroke = "#e8c840";
          textFill     = "#0f2044";
        }

        const canTap = interactive && tapState === null;

        return (
          <g key={key}>
            {/* Animated ball-zone ring */}
            {isBall && tapState === null && landed && (
              <circle
                cx={pos.x} cy={pos.y} r={28}
                fill="#ffd60a"
                opacity={0.22}
                className="animate-ping"
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              />
            )}

            {/* BALL label pill under the ball zone */}
            {isBall && landed && (
              <g style={{ pointerEvents: "none" }}>
                <rect
                  x={pos.x - 21} y={pos.y + 24}
                  width={42} height={15} rx={7.5}
                  fill="rgba(255,214,10,0.92)"
                />
                <text
                  x={pos.x} y={pos.y + 34.5}
                  textAnchor="middle"
                  fontSize={8.5} fontWeight="900" fill="#0f2044"
                  style={{ letterSpacing: "0.1em" }}
                >
                  BALL
                </text>
              </g>
            )}

            {/* Invisible large hit target for easier tapping */}
            {canTap && (
              <circle
                cx={pos.x} cy={pos.y} r={34}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => onTap?.(key)}
              />
            )}

            {/* Main circle */}
            <circle
              cx={pos.x} cy={pos.y} r={21}
              fill={circleFill}
              stroke={circleStroke}
              strokeWidth={2.5}
              filter={glowFilter}
              className={canTap ? "cursor-pointer" : undefined}
              onClick={canTap ? () => onTap?.(key) : undefined}
            />

            {/* Position label */}
            <text
              x={pos.x} y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={key.length > 2 ? 9 : 10.5}
              fontWeight="800"
              fill={textFill}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {pos.label}
            </text>

            {/* ✓ on correct answer */}
            {isTarget && (
              <text
                x={pos.x + 16} y={pos.y - 16}
                fontSize={15} fontWeight="bold" fill="#22c55e"
                style={{ pointerEvents: "none" }}
              >
                ✓
              </text>
            )}

            {/* ✗ on wrong tap */}
            {isWrong && (
              <text
                x={pos.x + 16} y={pos.y - 16}
                fontSize={15} fontWeight="bold" fill="#ef4444"
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
            <animateMotion path={hitPath} dur="0.5s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.6 1" keyTimes="0;1" />
            <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.92;1" dur="0.5s" fill="freeze" />
          </circle>
          <circle cx={ballPos.x} cy={ballPos.y} r={2} fill="none" stroke="#ffd60a" strokeWidth={3} opacity={0}>
            <animate attributeName="r" values="2;24" begin="0.42s" dur="0.35s" fill="freeze" />
            <animate attributeName="opacity" values="0.9;0" begin="0.42s" dur="0.35s" fill="freeze" />
          </circle>
        </g>
      )}

      {/* Runner legend */}
      {(runners.first || runners.second || runners.third) && (
        <>
          <circle cx={14} cy={376} r={6} fill="#ff3333" stroke="white" strokeWidth={1.5} />
          <text x={24} y={381} fontSize={10} fill="rgba(255,255,255,0.5)" style={{ userSelect: "none" }}>
            = runner on base
          </text>
        </>
      )}
    </svg>
  );
}
