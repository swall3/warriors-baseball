const NAME_ALIASES: Record<string, string> = {
  jackson: "Jack",
  jack: "Jack",
  linc: "Lincoln",
  lincoln: "Lincoln",
  aidan: "Aiden",
  aiden: "Aiden",
};

export function canonicalPlayerName(name?: string | null): string {
  const raw = (name || "").trim();
  if (!raw) return "Unknown";
  const key = raw.toLowerCase();
  return NAME_ALIASES[key] || raw;
}
