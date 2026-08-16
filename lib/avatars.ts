export interface ColorOption {
  id: string;
  label: string;
  bgClass: string;
  ringClass: string;
}

export const ACCENT_COLORS: ColorOption[] = [
  { id: "amber", label: "Amber", bgClass: "bg-amber-600", ringClass: "ring-amber-500" },
  { id: "teal", label: "Teal", bgClass: "bg-teal-600", ringClass: "ring-teal-500" },
  { id: "indigo", label: "Indigo", bgClass: "bg-indigo-600", ringClass: "ring-indigo-500" },
  { id: "emerald", label: "Emerald", bgClass: "bg-emerald-600", ringClass: "ring-emerald-500" },
  { id: "rose", label: "Rose", bgClass: "bg-rose-600", ringClass: "ring-rose-500" },
  { id: "cyan", label: "Cyan", bgClass: "bg-cyan-600", ringClass: "ring-cyan-500" },
  { id: "violet", label: "Violet", bgClass: "bg-violet-600", ringClass: "ring-violet-500" },
  { id: "orange", label: "Orange", bgClass: "bg-orange-600", ringClass: "ring-orange-500" },
];

export function getColorById(id?: string): ColorOption {
  const found = ACCENT_COLORS.find((c) => c.id === id);
  return found || ACCENT_COLORS[0];
}

export function getFirstInitial(name?: string): string {
  const clean = (name || "").trim();
  if (!clean) return "?";
  return clean[0].toUpperCase();
}
