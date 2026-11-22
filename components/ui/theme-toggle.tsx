"use client";
import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try { const t = localStorage.getItem("alums-theme"); if (t === "light" || t === "dark") setTheme(t); } catch {}
  }, []);
  const apply = (t: Theme) => {
    setTheme(t);
    try { if (t === "system") localStorage.removeItem("alums-theme"); else localStorage.setItem("alums-theme", t); } catch {}
    if (t === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  };
  return (
    <label className={className}>
      <span className="sr-only">Color theme</span>
      <select value={theme} onChange={(e) => apply(e.target.value as Theme)}
        className="h-9 rounded-lg border border-current/20 bg-transparent px-2 text-sm [&>option]:text-ink">
        <option value="system">System theme</option><option value="light">Light</option><option value="dark">Dark</option>
      </select>
    </label>
  );
}
