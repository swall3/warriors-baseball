"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";

interface Signup {
  id: string;
  player_name: string;
  age: number;
  parent_name: string;
  phone: string;
  email: string;
  position: string | null;
  experience: string | null;
  notes: string | null;
  signed_up_at: string;
}

export default function AdminPage() {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(false);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchSignups = useCallback(async (password: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/signups?pw=${encodeURIComponent(password)}`);
      if (res.status === 401) {
        setError("Wrong password");
        setAuthed(false);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setSignups(data.signups || []);
      setAuthed(true);
    } catch {
      setError("Could not load signups. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) {
      const interval = setInterval(() => fetchSignups(pw), 30000);
      return () => clearInterval(interval);
    }
  }, [authed, pw, fetchSignups]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSignups(pw);
  };

  const exportCSV = () => {
    const headers = ["Player Name", "Age", "Parent", "Phone", "Email", "Position", "Experience", "Notes", "Signed Up"];
    const rows = signups.map((s) => [
      s.player_name, s.age, s.parent_name, s.phone, s.email,
      s.position || "", s.experience || "", s.notes || "",
      new Date(s.signed_up_at).toLocaleString()
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `warriors-tryouts-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!authed) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <Image src="/images/warriors/mascot.png" alt="Warriors" width={100} height={100} className="object-contain h-20 w-auto mx-auto mb-4" />
            <h1 className="text-2xl font-black uppercase tracking-widest text-white"
              style={{ fontFamily: "Impact, Arial Black, sans-serif" }}>
              Admin Access
            </h1>
            <p className="text-gray-500 text-sm mt-2">Coaching staff only</p>
          </div>

          <form onSubmit={handleLogin} className="warrior-card rounded-xl p-8 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#c9a84c] mb-2">
                Password
              </label>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                required
                placeholder="Enter admin password"
                className="warrior-input w-full px-4 py-3 rounded-lg text-sm"
                autoFocus
              />
            </div>
            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-warrior w-full py-3 rounded-lg text-white font-black uppercase tracking-widest disabled:opacity-50"
              style={{ fontFamily: "Impact, Arial Black, sans-serif" }}
            >
              {loading ? "Checking..." : "Enter"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <Image src="/images/warriors/mascot.png" alt="Warriors" width={60} height={60} className="object-contain h-12 w-auto mb-3" />
          <h1 className="text-2xl font-black uppercase tracking-widest text-white"
            style={{ fontFamily: "Impact, Arial Black, sans-serif" }}>
            Tryout Signups
          </h1>
          <p className="text-gray-500 text-sm mt-1">{signups.length} registered · auto-refreshes every 30s</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => fetchSignups(pw)}
            disabled={loading}
            className="px-5 py-2 rounded-lg text-sm font-bold uppercase tracking-wider text-gray-300 hover:text-white transition-colors disabled:opacity-50"
            style={{ border: "1px solid rgba(160,160,160,0.3)" }}
          >
            {loading ? "..." : "↻ Refresh"}
          </button>
          {signups.length > 0 && (
            <button
              onClick={exportCSV}
              className="btn-warrior px-5 py-2 rounded-lg text-sm font-bold uppercase tracking-wider text-white"
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      <div className="tribal-divider max-w-6xl mx-auto mb-8" />

      {/* Table */}
      {signups.length === 0 ? (
        <div className="max-w-6xl mx-auto text-center py-24 text-gray-600">
          <div className="text-5xl mb-4">⚔</div>
          <p className="text-lg uppercase tracking-widest">No signups yet</p>
          <p className="text-sm mt-2">Share the site and the Warriors will fill up fast.</p>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(139,26,46,0.4)" }}>
                {["#", "Player", "Age", "Parent", "Phone", "Email", "Position", "Experience", "Notes", "Signed Up"].map((h) => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-bold uppercase tracking-widest text-[#c9a84c] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {signups.map((s, i) => (
                <tr
                  key={s.id}
                  className="group transition-colors"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(139,26,46,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td className="px-3 py-3 text-gray-600">{i + 1}</td>
                  <td className="px-3 py-3 text-white font-semibold whitespace-nowrap">{s.player_name}</td>
                  <td className="px-3 py-3 text-gray-300">{s.age}</td>
                  <td className="px-3 py-3 text-gray-300 whitespace-nowrap">{s.parent_name}</td>
                  <td className="px-3 py-3 text-gray-300 whitespace-nowrap">
                    <a href={`tel:${s.phone}`} className="hover:text-white transition-colors">{s.phone}</a>
                  </td>
                  <td className="px-3 py-3 text-gray-300">
                    <a href={`mailto:${s.email}`} className="hover:text-white transition-colors">{s.email}</a>
                  </td>
                  <td className="px-3 py-3 text-gray-400">{s.position || "—"}</td>
                  <td className="px-3 py-3 text-gray-400 whitespace-nowrap">{s.experience || "—"}</td>
                  <td className="px-3 py-3 text-gray-500 max-w-xs truncate">{s.notes || "—"}</td>
                  <td className="px-3 py-3 text-gray-600 whitespace-nowrap text-xs">
                    {new Date(s.signed_up_at).toLocaleDateString()}<br />
                    <span className="text-gray-700">{new Date(s.signed_up_at).toLocaleTimeString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
