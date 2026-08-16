"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowLeft, Copy, Check, Lock } from "lucide-react";

export default function CreateRoomPage() {
  const router = useRouter();

  const [nickname, setNickname] = useState<string>("");
  const [roomName, setRoomName] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);
  const [createdRoomName, setCreatedRoomName] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState<boolean>(false);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: roomName.trim() || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create room");
      }

      const data = await res.json();
      setCreatedRoomCode(data.code);
      setCreatedRoomName(data.name);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!createdRoomCode) return;
    const fullUrl = `http://localhost:3000/r/${createdRoomCode}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleEnterRoom = () => {
    if (!createdRoomCode) return;
    const trimmedName = nickname.trim() || "Anonymous";
    const sessionObj = {
      roomCode: createdRoomCode,
      nickname: trimmedName,
    };
    sessionStorage.setItem(`tsu-session-${createdRoomCode}`, JSON.stringify(sessionObj));
    router.push(`/r/${createdRoomCode}?name=${encodeURIComponent(trimmedName)}`);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-between p-6 sm:p-12 dark:bg-[#0f0f11] bg-[#fafafa] dark:text-zinc-100 text-zinc-900 font-sans transition-colors duration-150">
      {/* Top Header */}
      <div className="w-full max-w-sm flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs dark:text-zinc-400 text-zinc-600 hover:dark:text-zinc-200 transition-colors font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </Link>
        <ThemeToggle />
      </div>

      {/* Main Form Container */}
      <div className="w-full max-w-sm my-auto py-6">
        <div className="p-6 sm:p-8 rounded-2xl dark:bg-[#18181b] bg-white border dark:border-zinc-800 border-zinc-200 space-y-6">
          <h1 className="text-xl font-bold tracking-tight dark:text-white text-zinc-950">
            Create a Room
          </h1>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 text-red-500 text-xs font-medium">
              {error}
            </div>
          )}

          {!createdRoomCode ? (
            <form onSubmit={handleCreateRoom} className="space-y-4">
              {/* Optional Room Name Input */}
              <div className="space-y-2">
                <label
                  htmlFor="room-title-name"
                  className="block text-xs font-medium uppercase tracking-wider dark:text-zinc-400 text-zinc-600"
                >
                  Room Name <span className="text-[10px] lowercase text-zinc-400 font-normal">(optional)</span>
                </label>
                <input
                  id="room-title-name"
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="e.g. Study Group, Alex chat, Team sync"
                  maxLength={30}
                  className="w-full py-2.5 px-3.5 rounded-xl dark:bg-[#0f0f11] bg-zinc-100 dark:border-zinc-800 border-zinc-300 dark:text-white text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#128c7e]/50 dark:focus:ring-[#25d366]/50 focus:border-[#128c7e] dark:focus:border-[#25d366] transition-all text-sm font-sans"
                />
              </div>

              {/* Nickname Input */}
              <div className="space-y-2">
                <label
                  htmlFor="temporary-name"
                  className="block text-xs font-medium uppercase tracking-wider dark:text-zinc-400 text-zinc-600"
                >
                  Temporary Nickname
                </label>
                <input
                  id="temporary-name"
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Anonymous"
                  maxLength={20}
                  className="w-full py-2.5 px-3.5 rounded-xl dark:bg-[#0f0f11] bg-zinc-100 dark:border-zinc-800 border-zinc-300 dark:text-white text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#128c7e]/50 dark:focus:ring-[#25d366]/50 focus:border-[#128c7e] dark:focus:border-[#25d366] transition-all text-sm font-sans"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-5 rounded-xl font-medium text-white dark:text-[#0b1210] dark:font-bold bg-[#128c7e] hover:bg-[#0f766a] dark:bg-[#25d366] hover:dark:bg-[#20bd5a] disabled:opacity-50 transition-colors duration-150 cursor-pointer text-sm"
              >
                {loading ? "Generating Room..." : "Generate Room Code"}
              </button>
            </form>
          ) : (
            /* Created Room Success State */
            <div className="space-y-4 text-center animate-fadeIn">
              <div className="p-5 rounded-xl dark:bg-[#0f0f11] bg-zinc-100 border dark:border-zinc-800 border-zinc-200 space-y-1">
                {createdRoomName && (
                  <span className="text-sm font-bold text-zinc-900 dark:text-white block truncate">
                    {createdRoomName}
                  </span>
                )}
                <span className="text-xs uppercase tracking-wider dark:text-zinc-400 text-zinc-600 font-medium block">
                  Room Code
                </span>
                <span className="text-3xl font-mono font-bold tracking-widest text-[#128c7e] dark:text-[#25d366] block">
                  {createdRoomCode}
                </span>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="w-full py-2.5 px-4 rounded-xl font-medium dark:bg-zinc-800 bg-zinc-200 hover:dark:bg-zinc-700 text-xs dark:text-zinc-200 text-zinc-800 transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Room Link</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleEnterRoom}
                  className="w-full py-3 px-5 rounded-xl font-medium text-white dark:text-[#0b1210] dark:font-bold bg-[#128c7e] hover:bg-[#0f766a] dark:bg-[#25d366] hover:dark:bg-[#20bd5a] transition-colors duration-150 cursor-pointer flex items-center justify-center gap-2 text-sm"
                >
                  <Lock className="w-4 h-4" />
                  <span>Enter Room</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="py-6 text-center text-xs dark:text-zinc-600 text-zinc-400 font-mono">
        Auto-expires in 60 minutes
      </footer>
    </main>
  );
}
