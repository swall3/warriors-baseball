import type { ReactNode } from "react";
import { Suspense } from "react";
import "./training.css";
import GameProgressPlayer from "./GameProgressPlayer";
export default function TrainingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="training-surface">
      <Suspense fallback={null}>
        <GameProgressPlayer />
      </Suspense>
      {children}
    </div>
  );
}
