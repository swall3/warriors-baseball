"use client";

import { useEffect, useState } from "react";
import styles from "./InstallPrompt.module.css";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const onPrompt = (candidate: Event) => {
      candidate.preventDefault();
      setEvent(candidate as InstallEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!event) return null;
  return <button type="button" className={styles.button} onClick={async () => {
    const pending = event;
    setEvent(null);
    await pending.prompt();
    await pending.userChoice;
  }}>Install InningWise</button>;
}
