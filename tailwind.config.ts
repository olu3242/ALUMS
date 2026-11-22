import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  // Mirrors the token switch in globals.css: system dark unless forced light, or forced dark.
  darkMode: ["variant", ['@media (prefers-color-scheme: dark) { &:not([data-theme="light"] *) }', '&:is([data-theme="dark"] *)']],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1200px" } },
    extend: {
      colors: {
        navy: "#10243A",
        orange: { DEFAULT: "#EA580C", strong: "#C2410C", deep: "#9A3412" },
        gold: "#D8AD58",
        champagne: "#F2DCA5",
        ivory: "#FAF8F3",
        bg: v("bg"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        ink: v("ink"),
        muted: v("muted"),
        line: v("line"),
        primary: v("primary"),
        "primary-fg": v("primary-fg"),
        accent: v("accent"),
        "accent-text": v("accent-text"),
        success: v("success"),
        warning: v("warning"),
        danger: v("danger"),
      },
      fontFamily: {
        heading: ["var(--font-heading)", "Manrope", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "Inter", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "DM Serif Display", "Georgia", "serif"],
      },
      borderRadius: { xl: "14px", "2xl": "20px" },
      boxShadow: {
        card: "0 1px 2px rgb(16 36 58 / 0.06), 0 8px 24px -12px rgb(16 36 58 / 0.18)",
        lift: "0 12px 32px -12px rgb(16 36 58 / 0.28)",
      },
      keyframes: { rise: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } } },
      animation: { rise: "rise .6s cubic-bezier(.2,.7,.2,1) both" },
    },
  },
  plugins: [],
} satisfies Config;
