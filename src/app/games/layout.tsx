import type { ReactNode } from "react";
import "./training.css";
export default function TrainingLayout({ children }: { children: ReactNode }) {
  return <div className="training-surface">{children}</div>;
}
