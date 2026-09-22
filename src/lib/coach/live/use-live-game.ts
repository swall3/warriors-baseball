"use client";
import { useCoachOrg } from "@/lib/coach/org-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyCommand, type Command, type Lane, type LiveGame } from "./model";
export type PendingCommand = {
  id: string;
  expectedRevision: number;
  command: Command;
};
type Cache = { confirmed: LiveGame; queue: PendingCommand[]; lane: Lane };
export function useLiveGame(
  orgId: string | null,
  gameId: string,
  readOnly = false,
) {
  const { userId } = useCoachOrg();
  const deviceScope = userId ? `${orgId}:user:${userId}` : orgId;
  const [game, setGame] = useState<LiveGame | null>(null);
  const [confirmed, setConfirmed] = useState<LiveGame | null>(null);
  const [lane, setLane] = useState<Lane>("display");
  const [queue, setQueue] = useState<PendingCommand[]>([]);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [online, setOnline] = useState(true);
  const [lastSeen, setLastSeen] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const cache = useRef<Cache | null>(null);
  const token = useRef("");
  const storageKey = useRef("");
  const draining = useRef(false);
  const stopped = useRef(false);
  const generation = useRef(0);
  const conflictRef = useRef(false);
  const initialized = useRef(false);
  const refreshNow = useRef<() => Promise<void>>(async () => {});
  const [authRequired, setAuthRequired] = useState(false);
  const [assignment, setAssignment] = useState<{
    label?: string;
    expiresAt?: string;
  } | null>(null);
  const writer = useRef(false);
  const [recordingAllowed, setRecordingAllowed] = useState(false);
  function publish(value: Cache) {
    cache.current = value;
    setConfirmed(value.confirmed);
    setQueue(value.queue);
    setLane(value.lane);
    let projection = value.confirmed;
    try {
      for (const item of value.queue)
        projection = applyCommand(
          projection,
          item.command,
          item.id,
          value.lane,
          new Date().toISOString(),
        );
    } catch {
      conflictRef.current = true;
      setConflict(true);
    }
    setGame(projection);
  }
  function persist(value: Cache) {
    localStorage.setItem(storageKey.current, JSON.stringify(value));
    publish(value);
  }
  const headers = useCallback(
    () => ({
      "Content-Type": "application/json",
      ...(token.current ? { "x-recording-token": token.current } : {}),
    }),
    [],
  );
  const drain = useCallback(async () => {
    if (
      draining.current ||
      stopped.current ||
      conflictRef.current ||
      !initialized.current ||
      !writer.current ||
      readOnly
    )
      return;
    draining.current = true;
    const currentGeneration = generation.current;
    try {
      while (
        cache.current?.queue.length &&
        !stopped.current &&
        !conflictRef.current
      ) {
        const pending = cache.current.queue[0];
        const response = await fetch(
          `/api/coach/live/${encodeURIComponent(gameId)}`,
          {
            method: "POST",
            headers: headers(),
            body: JSON.stringify(pending),
            signal: AbortSignal.timeout(10000),
          },
        );
        const data = await response.json();
        if (stopped.current || generation.current !== currentGeneration) break;
        if (!response.ok) {
          setError(data.error ?? "Unable to confirm this action.");
          if (response.status === 401) setAuthRequired(true);
          if (
            response.status === 401 ||
            response.status === 409 ||
            response.status === 400 ||
            response.status === 403
          ) {
            conflictRef.current = true;
            setConflict(true);
            if (data.game) {
              setConfirmed(data.game);
            }
          } else setOnline(false);
          break;
        }
        if (stopped.current) break;
        const current = cache.current;
        if (current.queue[0]?.id !== pending.id) break;
        persist({
          ...current,
          confirmed: data.game,
          queue: current.queue.slice(1),
        });
        setOnline(true);
        setLastSeen(Date.now());
        setError("");
      }
    } catch (e) {
      if (!stopped.current && generation.current === currentGeneration) {
        setOnline(false);
        setError(
          e instanceof Error && e.name === "QuotaExceededError"
            ? "Device storage is full. Keep this page open and free space before retrying."
            : "Connection lost. Unconfirmed actions remain saved on this device.",
        );
      }
    } finally {
      if (generation.current === currentGeneration) draining.current = false;
    }
  }, [gameId, headers, readOnly]);
  useEffect(() => {
    if (!orgId) return;
    generation.current += 1;
    draining.current = false;
    stopped.current = false;
    initialized.current = false;
    conflictRef.current = false;
    cache.current = null;
    setConflict(false);
    setGame(null);
    setConfirmed(null);
    setQueue([]);
    setAuthRequired(false);
    setAssignment(null);
    setError("");
    writer.current = false;
    setRecordingAllowed(false);
    const tokenKey = `coach:${deviceScope}:recording:${gameId}`;
    try {
      const fragment = new URLSearchParams(location.hash.slice(1));
      const incoming = fragment.get("record");
      if (incoming) {
        sessionStorage.setItem(tokenKey, incoming);
        history.replaceState(null, "", location.pathname + location.search);
      }
      token.current = sessionStorage.getItem(tokenKey) ?? "";
      storageKey.current = `coach:${deviceScope}:live:v1:${gameId}:${readOnly ? "board" : token.current ? token.current.slice(-12) : "session"}`;
      const saved = localStorage.getItem(storageKey.current);
      if (saved) {
        const value = JSON.parse(saved) as Cache;
        if (value.confirmed?.id === gameId && Array.isArray(value.queue))
          publish(value);
      }
    } catch {
      setError(
        "Device storage could not be restored. Recording needs working browser storage.",
      );
    }
    let active = true;
    let refreshing = false;
    const lockRequest = new AbortController();
    let releaseLock: (() => void) | undefined;
    const refresh = async () => {
      if (!active || refreshing) return;
      refreshing = true;
      try {
        const response = await fetch(
          `/api/coach/live/${encodeURIComponent(gameId)}`,
          {
            cache: "no-store",
            headers: headers(),
            signal: AbortSignal.timeout(10000),
          },
        );
        const data = await response.json();
        if (!active) return;
        if (!response.ok) {
          setError(data.error ?? "Unable to open this game.");
          if (response.status === 401) setAuthRequired(true);
          if (
            response.status === 403 ||
            response.status === 401 ||
            response.status === 404
          ) {
            conflictRef.current = true;
            setConflict(true);
            setGame(null);
            setConfirmed(null);
          }
          setOnline(false);
          return;
        }
        initialized.current = true;
        setAuthRequired(false);
        setAssignment(data.assignment ?? null);
        setOnline(true);
        setLastSeen(Date.now());
        setLane(data.lane);
        if (!cache.current?.queue.length) {
          conflictRef.current = false;
          setConflict(false);
          if (
            !cache.current ||
            data.game.revision >= cache.current.confirmed.revision
          )
            (writer.current || readOnly ? persist : publish)({
              confirmed: data.game,
              queue: [],
              lane: data.lane,
            });
        } else {
          cache.current = { ...cache.current, lane: data.lane };
          setConfirmed((previous) =>
            previous && previous.revision > data.game.revision
              ? previous
              : data.game,
          );
        }
        if (!conflictRef.current) setError("");
        await drain();
      } catch {
        if (active) {
          setOnline(false);
          setError("Connection lost. Showing the last confirmed game state.");
        }
      } finally {
        refreshing = false;
      }
    };
    if (!readOnly && navigator.locks) {
      // One tab owns a role's durable queue. Separate grants and separate
      // devices remain independent; an extra tab cannot overwrite unsent work.
      void navigator.locks
        .request(
          storageKey.current,
          { signal: lockRequest.signal },
          async (lock) => {
            if (!active || !lock) return;
            // Another tab may have saved work while this tab waited for ownership.
            const saved = localStorage.getItem(storageKey.current);
            if (saved) {
              const value = JSON.parse(saved) as Cache;
              if (value.confirmed?.id === gameId && Array.isArray(value.queue))
                publish(value);
            }
            writer.current = true;
            setRecordingAllowed(true);
            void refresh();
            await new Promise<void>((resolve) => {
              releaseLock = resolve;
            });
          },
        )
        .catch((error: unknown) => {
          if (
            active &&
            !(error instanceof DOMException && error.name === "AbortError")
          )
            setError(
              "Recording could not start. Check browser storage and reload this page.",
            );
        });
    }
    refreshNow.current = refresh;
    const resume = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const offline = () => {
      setOnline(false);
      setError(
        "Connection lost. New actions stay on this device until confirmed.",
      );
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (cache.current?.queue.length) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("offline", offline);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("beforeunload", beforeUnload);
    void refresh();
    const interval = setInterval(() => {
      setClock(Date.now());
      void refresh();
    }, 3000);
    window.addEventListener("online", refresh);
    return () => {
      active = false;
      stopped.current = true;
      generation.current += 1;
      writer.current = false;
      lockRequest.abort();
      releaseLock?.();
      clearInterval(interval);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [orgId, deviceScope, gameId, headers, drain, readOnly]);
  async function send(command: Command) {
    if (!writer.current || readOnly)
      throw new Error(
        "This tab is read-only. Close another tab recording this role, then reload here. Recording requires a browser that supports Web Locks.",
      );
    if (!cache.current || !initialized.current)
      throw new Error("Connect to the game before recording.");
    if (conflictRef.current)
      throw new Error("Review the unconfirmed action first.");
    if (command.type === "finish" && (!online || cache.current.queue.length))
      throw new Error("Reconnect and confirm all actions before finishing.");
    let projection = cache.current.confirmed;
    for (const item of cache.current.queue)
      projection = applyCommand(
        projection,
        item.command,
        item.id,
        cache.current.lane,
        new Date().toISOString(),
      );
    const pending = {
      id: crypto.randomUUID(),
      expectedRevision: projection.revision,
      command,
    };
    applyCommand(
      projection,
      command,
      pending.id,
      cache.current.lane,
      new Date().toISOString(),
    );
    persist({ ...cache.current, queue: [...cache.current.queue, pending] });
    void drain();
  }
  async function discardQueue() {
    if (!writer.current || readOnly)
      throw new Error(
        "Only the recording tab can clear its unconfirmed actions.",
      );
    if (draining.current)
      throw new Error("Wait for the current request before clearing actions.");
    const currentGeneration = generation.current;
    const response = await fetch(
      `/api/coach/live/${encodeURIComponent(gameId)}`,
      {
        cache: "no-store",
        headers: headers(),
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = await response.json();
    if (generation.current !== currentGeneration || !writer.current) return;
    if (!response.ok) throw new Error(data.error);
    conflictRef.current = false;
    setConflict(false);
    persist({ confirmed: data.game, queue: [], lane: data.lane });
    setError("");
    setOnline(true);
    setLastSeen(Date.now());
  }
  return {
    recordingAllowed,
    game,
    confirmed,
    lane,
    queue,
    error,
    conflict,
    online,
    stale: !online || clock - lastSeen > 12000,
    lastSeen,
    send,
    retry: async () => {
      await refreshNow.current();
      await drain();
    },
    authRequired,
    assignment,
    discardQueue,
    headers,
  };
}
