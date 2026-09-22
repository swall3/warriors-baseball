export type Contact = {
  x: number;
  y: number;
  result: string;
  battingTeam: string;
};
export type TeamFilter = "all" | "us" | "them";
export type ContactFilter = "all" | "hits" | "outs";
const hits = new Set(["single", "double", "triple", "home_run"]);
const outs = new Set(["out", "fielders_choice"]);
export function isContact(e: Contact) {
  return (
    Number.isFinite(e.x) &&
    Number.isFinite(e.y) &&
    e.x >= 0 &&
    e.x <= 100 &&
    e.y >= 0 &&
    e.y <= 100 &&
    (e.battingTeam === "us" || e.battingTeam === "them") &&
    (hits.has(e.result) || outs.has(e.result) || e.result === "error")
  );
}
export function selectContacts<T extends Contact>(
  events: T[],
  team: TeamFilter,
  outcome: ContactFilter,
): T[] {
  return events.filter(
    (e) =>
      isContact(e) &&
      (team === "all" || e.battingTeam === team) &&
      (outcome === "all" || (outcome === "hits" ? hits : outs).has(e.result)),
  );
}
function blur(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(w * h),
    norm = 1 / (r * 2 + 1);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    const row = y * w;
    for (let i = -r; i <= r; i++)
      sum += src[row + Math.min(w - 1, Math.max(0, i))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum * norm;
      sum +=
        src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let i = -r; i <= r; i++)
      sum += tmp[Math.min(h - 1, Math.max(0, i)) * w + x];
    for (let y = 0; y < h; y++) {
      src[y * w + x] = sum * norm;
      sum +=
        tmp[Math.min(h - 1, y + r + 1) * w + x] -
        tmp[Math.max(0, y - r) * w + x];
    }
  }
}
export function contactDensity(
  events: Contact[],
  width: number,
  height: number,
  radius: number,
) {
  const field = new Float32Array(width * height);
  for (const e of events)
    if (isContact(e))
      field[
        Math.round((e.y / 100) * (height - 1)) * width +
          Math.round((e.x / 100) * (width - 1))
      ]++;
  const r = Math.max(1, Math.round(radius));
  blur(field, width, height, r);
  blur(field, width, height, r);
  blur(field, width, height, r);
  let peak = 0;
  for (const value of field) peak = Math.max(peak, value);
  if (peak) for (let i = 0; i < field.length; i++) field[i] /= peak;
  return field;
}
const palette = [
  [28, 72, 196],
  [0, 174, 225],
  [26, 211, 169],
  [160, 225, 65],
  [255, 216, 54],
  [255, 125, 32],
  [218, 37, 47],
];
export function densityColor(value: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, value)) * (palette.length - 1),
    i = Math.min(palette.length - 2, Math.floor(t)),
    f = t - i;
  return palette[i].map((v, k) =>
    Math.round(v + (palette[i + 1][k] - v) * f),
  ) as [number, number, number];
}
