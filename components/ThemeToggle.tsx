"use client";

import { useTheme } from "@/lib/theme";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="p-2 rounded-xl dark:bg-[#18181b] bg-white hover:dark:bg-[#202023] hover:bg-zinc-100 dark:text-zinc-300 text-zinc-700 border dark:border-zinc-800 border-zinc-200 transition-colors cursor-pointer flex items-center justify-center"
      title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
      aria-label="Toggle Theme"
    >
      {theme === "dark" ? (
        <Sun className="w-4 h-4 text-[#25d366]" />
      ) : (
        <Moon className="w-4 h-4 text-[#128c7e]" />
      )}
    </button>
  );
}
