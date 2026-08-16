"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

const ROTATING_PHRASES = [
  "anyone.",
  "strangers.",
  "two people.",
  "no one you know.",
  "5 minutes.",
  "whoever needs it.",
];

export default function Home() {
  const [displayedText, setDisplayedText] = useState<string>("");

  useEffect(() => {
    // Select one random phrase on initial page load
    const phrase = ROTATING_PHRASES[Math.floor(Math.random() * ROTATING_PHRASES.length)];

    // Respect prefers-reduced-motion accessibility setting
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setDisplayedText(phrase);
      return;
    }

    let charIndex = 0;
    const typingInterval = setInterval(() => {
      charIndex++;
      setDisplayedText(phrase.slice(0, charIndex));

      if (charIndex >= phrase.length) {
        clearInterval(typingInterval);
      }
    }, 50);

    return () => clearInterval(typingInterval);
  }, []);

  return (
    <main className="min-h-screen flex flex-col justify-between p-6 sm:p-12 dark:bg-[#0f0f11] bg-[#fafafa] dark:text-zinc-100 text-zinc-900 font-sans transition-colors duration-150">
      {/* Top Header */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Tsu Logo"
            className="w-7 h-7 rounded-full object-cover ring-1 ring-[#128c7e]/30 dark:ring-[#25d366]/30"
          />
          <span className="font-mono text-sm font-bold tracking-wider uppercase dark:text-zinc-300 text-zinc-800">
            TSU
          </span>
        </div>
        <ThemeToggle />
      </header>

      {/* Simplified Minimal Hero Section */}
      <section className="w-full max-w-xl mx-auto my-auto py-16 space-y-8 text-center sm:text-left">
        <div className="space-y-3">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight dark:text-white text-zinc-950 leading-[1.15]">
            Ephemeral, private chat for{" "}
            <span className="font-mono text-[#128c7e] dark:text-[#25d366] whitespace-nowrap">
              {displayedText}
              <span className="animate-pulse inline-block font-mono text-[#128c7e] dark:text-[#25d366] font-normal ml-0.5">
                |
              </span>
            </span>
          </h1>
          <p className="text-sm sm:text-base dark:text-zinc-400 text-zinc-600 leading-relaxed">
            Disposable chat rooms for instant communication. No accounts, no phone numbers, auto-expires in 60 minutes.
          </p>
        </div>

        {/* Simple Plain Actions Choice */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <Link
            href="/create"
            className="w-full sm:w-auto py-3 px-6 rounded-xl font-medium text-white dark:text-[#0b1210] dark:font-bold bg-[#128c7e] hover:bg-[#0f766a] dark:bg-[#25d366] hover:dark:bg-[#20bd5a] transition-colors duration-150 text-center text-sm"
          >
            Create Room
          </Link>
          <Link
            href="/join"
            className="w-full sm:w-auto py-3 px-6 rounded-xl font-medium dark:text-zinc-300 text-zinc-700 dark:bg-[#18181b] bg-zinc-200 hover:dark:bg-zinc-800 hover:bg-zinc-300 transition-colors duration-150 text-center text-sm"
          >
            Join Room
          </Link>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="w-full max-w-4xl mx-auto text-xs dark:text-zinc-600 text-zinc-400 font-mono text-center sm:text-left">
        Auto-expires in 60 minutes • In-memory only
      </footer>
    </main>
  );
}
