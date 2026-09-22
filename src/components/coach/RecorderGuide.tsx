"use client";
import type { Lane } from "@/lib/coach/live/model";
export const laneNames: Record<Lane, string> = {
  coach: "Coach",
  pitch: "Pitch recorder",
  play: "Play recorder",
  all: "All scoring",
  display: "Dugout display",
};
export function RecorderGuide({
  lane,
  label,
  expiresAt,
}: {
  lane: Lane;
  label?: string;
  expiresAt?: string;
}) {
  if (lane === "coach") return null;
  return (
    <details className="nf-card nf-recorder-guide">
      <summary>
        <strong>
          {label ? `${label} · ` : ""}
          {laneNames[lane]}: your job
        </strong>
      </summary>
      {lane === "pitch" ? (
        <ol>
          <li>Tap once for every delivered pitch, including fouls.</li>
          <li>
            When the ball is hit, tap In play. Wait for the play recorder to
            finish it.
          </li>
          <li>If a tap was wrong, tell the coach before the next pitch.</li>
        </ol>
      ) : lane === "play" ? (
        <ol>
          <li>Wait for the pitch recorder to mark In play.</li>
          <li>Choose where the ball went and the result.</li>
          <li>
            Confirm where every runner ended, then confirm the play. Do not
            count the pitch again.
          </li>
        </ol>
      ) : lane === "all" ? (
        <p>
          Count each pitch, then finish every ball in play and confirm each
          runner’s destination.
        </p>
      ) : (
        <p>
          This screen only displays confirmed updates. Mount the tablet where
          players can read it, then use Keep screen awake.
        </p>
      )}
      <p>
        Watch the save status. If signal drops, keep this tab open. The board
        updates after actions are confirmed. Reopen this exact link if you
        switch devices.
      </p>
      {expiresAt && (
        <small>
          Assignment expires {new Date(expiresAt).toLocaleString()}. Ask the
          coach for a fresh link if needed.
        </small>
      )}
    </details>
  );
}
