"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowLeft, LogIn, AlertCircle } from "lucide-react";

export default function JoinRoomPage() {
  const router = useRouter();

  const [code, setCode] = useState<string>("");
  const [name, setName] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();

    if (!cleanCode || cleanCode.length !== 6) {
      setError("Room code must be exactly 6 characters");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/rooms/${cleanCode}`);
      const data = await res.json();

      if (!res.ok || data.valid !== true) {
        throw new Error(data.message || "Invalid or expired room code");
      }

      const trimmedName = name.trim() || "Anonymous";
      const sessionObj = {
        roomCode: cleanCode,
        nickname: trimmedName,
      };
      sessionStorage.setItem(`tsu-session-${cleanCode}`, JSON.stringify(sessionObj));

      router.push(`/r/${cleanCode}?name=${encodeURIComponent(trimmedName)}`);
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
            Join a Room
          </h1>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 text-red-500 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleJoinRoom} className="space-y-4">
            {/* Room Code Input */}
            <div className="space-y-2">
              <label
                htmlFor="room-code-input"
                className="block text-xs font-medium uppercase tracking-wider dark:text-zinc-400 text-zinc-600"
              >
                Room Code
              </label>
              <input
                id="room-code-input"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="X8K9L2"
                maxLength={6}
                className="w-full py-2.5 px-4 rounded-xl dark:bg-[#0f0f11] bg-zinc-100 border dark:border-zinc-800 border-zinc-300 dark:text-white text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#128c7e]/50 dark:focus:ring-[#25d366]/50 focus:border-[#128c7e] dark:focus:border-[#25d366] transition-all font-mono font-bold tracking-widest text-center text-lg uppercase"
              />
            </div>

            {/* Temporary Nickname Input */}
            <div className="space-y-2">
              <label
                htmlFor="join-temporary-name"
                className="block text-xs font-medium uppercase tracking-wider dark:text-zinc-400 text-zinc-600"
              >
                Temporary Nickname
              </label>
              <input
                id="join-temporary-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Anonymous"
                maxLength={20}
                className="w-full py-2.5 px-3.5 rounded-xl dark:bg-[#0f0f11] bg-zinc-100 border dark:border-zinc-800 border-zinc-300 dark:text-white text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#128c7e]/50 dark:focus:ring-[#25d366]/50 focus:border-[#128c7e] dark:focus:border-[#25d366] transition-all text-sm font-sans"
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.trim().length !== 6}
              className="w-full py-3 px-5 rounded-xl font-medium text-white dark:text-[#0b1210] dark:font-bold bg-[#128c7e] hover:bg-[#0f766a] dark:bg-[#25d366] hover:dark:bg-[#20bd5a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 text-sm cursor-pointer flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <span>Validating...</span>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Join Room</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <footer className="py-6 text-center text-xs dark:text-zinc-600 text-zinc-400 font-mono">
        Auto-expires in 60 minutes
      </footer>
    </main>
  );
}
