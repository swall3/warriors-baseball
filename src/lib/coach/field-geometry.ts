// Overhead baseball field drawn to 8U Dizzy Dean kid-pitch proportions.
// Dizzy Dean 8U: 50 ft base paths, pitching rubber 39 ft from home, home→2nd
// 70'8½" (= 50·√2), outfield fence ~180 ft. Foul lines are 90° apart.
// We don't track true ball distance, so the field exists to give hit positions
// a coherent, correctly-proportioned backdrop. `zoneAnchorPct` is the single
// source of truth used to place stored play events onto this field.

type Ctx = CanvasRenderingContext2D;

// Real 8U dimensions (feet).
const FT = { base: 50, mound: 39, home2nd: 50 * Math.SQRT2, arc: 45, fence: 180 };

export type FieldPoints = ReturnType<typeof fieldPoints>;

export function fieldPoints(W: number, H: number) {
  const cx = W / 2;
  const homeY = H * 0.95;
  // Scale so the ~180 ft fence reaches near the top of the frame.
  const s = (H * 0.9) / FT.fence; // px per foot
  const d = Math.SQRT1_2; // sin/cos 45°
  const home: [number, number] = [cx, homeY];
  const first: [number, number] = [cx + FT.base * s * d, homeY - FT.base * s * d];
  const second: [number, number] = [cx, homeY - FT.home2nd * s];
  const third: [number, number] = [cx - FT.base * s * d, homeY - FT.base * s * d];
  const mound: [number, number] = [cx, homeY - FT.mound * s];
  const reach = homeY; // 45° foul lines run out to the frame edges
  const leftFoul: [number, number] = [cx - reach, homeY - reach];
  const rightFoul: [number, number] = [cx + reach, homeY - reach];
  return { cx, homeY, s, home, first, second, third, mound, leftFoul, rightFoul };
}

// Defensive-position anchors for each stored zone, as % (0–100) of the canvas,
// computed from the same geometry so events land where the field says they should.
export const FIELD_ZONES = [
  "catcher_zone", "pitcher_zone", "first_base", "second_base", "third_base",
  "shortstop", "left_field", "left_center", "center_field", "right_center", "right_field",
] as const;
export type FieldZone = (typeof FIELD_ZONES)[number];

// Anchor offsets expressed in feet from home plate: [rightFeet, depthFeet].
// depth = toward center field, right = toward the first-base/right-field side.
const ZONE_FT: Record<FieldZone, [number, number]> = {
  catcher_zone: [0, -7],
  pitcher_zone: [0, 39],
  first_base: [33, 38],
  second_base: [20, 60],
  shortstop: [-20, 60],
  third_base: [-33, 38],
  left_field: [-70, 105],
  left_center: [-38, 128],
  center_field: [0, 135],
  right_center: [38, 128],
  right_field: [70, 105],
};

export function zoneAnchorPct(zone: string, W = 648, H = 432): [number, number] {
  const { cx, homeY, s } = fieldPoints(W, H);
  const ft = ZONE_FT[zone as FieldZone] ?? [0, 60];
  const xpx = cx + ft[0] * s;
  const ypx = homeY - ft[1] * s;
  return [(xpx / W) * 100, (ypx / H) * 100];
}

export function drawBaseballField(ctx: Ctx, W: number, H: number) {
  const P = fieldPoints(W, H);
  const { cx, homeY, s, home, first, second, third, mound, leftFoul, rightFoul } = P;

  // ── 1. Foul/dead territory (whole frame), then fair wedge on top ──
  ctx.fillStyle = "#16291d";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#1f4a24";
  ctx.beginPath();
  ctx.moveTo(home[0], home[1]);
  ctx.lineTo(leftFoul[0], leftFoul[1]);
  ctx.lineTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(rightFoul[0], rightFoul[1]);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 14;
  for (const rr of [0.62, 0.78, 0.94]) {
    ctx.beginPath();
    ctx.arc(home[0], home[1], H * rr, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();
  }

  // ── 2. Infield skin (dirt ~45 ft around the mound), clipped to fair ground ──
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(home[0], home[1]);
  ctx.lineTo(leftFoul[0], leftFoul[1]);
  ctx.lineTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(rightFoul[0], rightFoul[1]);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = "#9c7045";
  ctx.beginPath();
  ctx.arc(mound[0], mound[1], FT.arc * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── 3. Infield grass diamond ──
  ctx.fillStyle = "#236327";
  ctx.beginPath();
  ctx.moveTo(home[0], home[1] - 6 * s);
  ctx.lineTo(first[0] - 6 * s, first[1]);
  ctx.lineTo(second[0], second[1] + 6 * s);
  ctx.lineTo(third[0] + 6 * s, third[1]);
  ctx.closePath();
  ctx.fill();

  // ── 4. Base paths + foul lines ──
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(2, s * 1.4);
  ctx.beginPath();
  ctx.moveTo(home[0], home[1]);
  ctx.lineTo(first[0], first[1]);
  ctx.lineTo(second[0], second[1]);
  ctx.lineTo(third[0], third[1]);
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = Math.max(2, s * 1.2);
  ctx.beginPath();
  ctx.moveTo(home[0], home[1]); ctx.lineTo(leftFoul[0], leftFoul[1]);
  ctx.moveTo(home[0], home[1]); ctx.lineTo(rightFoul[0], rightFoul[1]);
  ctx.stroke();

  // ── 5. Bases + home plate ──
  const baseSize = Math.max(7, s * 2.2);
  for (const b of [first, second, third]) {
    ctx.save();
    ctx.translate(b[0], b[1]);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(-baseSize / 2, -baseSize / 2, baseSize, baseSize);
    ctx.restore();
  }
  const hp = Math.max(6, s * 2);
  ctx.fillStyle = "#f4f4f4";
  ctx.beginPath();
  ctx.moveTo(home[0] - hp, home[1] - hp);
  ctx.lineTo(home[0] + hp, home[1] - hp);
  ctx.lineTo(home[0] + hp, home[1]);
  ctx.lineTo(home[0], home[1] + hp);
  ctx.lineTo(home[0] - hp, home[1]);
  ctx.closePath();
  ctx.fill();

  // ── 6. Pitcher's mound + rubber ──
  ctx.fillStyle = "#8a5e38";
  ctx.beginPath();
  ctx.arc(mound[0], mound[1], 14 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8e8e8";
  ctx.fillRect(mound[0] - 4 * s, mound[1] - s * 0.6, 8 * s, s * 1.2);

  // ── 7. Outfield wall (faint arc) + zone labels ──
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(home[0], home[1], homeY * 0.92, Math.PI * 1.27, Math.PI * 1.73);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.font = `600 ${Math.round(H * 0.028)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("LF", W * 0.2, H * 0.4);
  ctx.fillText("CF", cx, H * 0.13);
  ctx.fillText("RF", W * 0.8, H * 0.4);
}
