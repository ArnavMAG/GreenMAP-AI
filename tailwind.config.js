/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#060d1f",
          900: "#0a1330",
          800: "#0f1c3f",
          700: "#16264f",
          600: "#1f3263",
        },
        leaf: {
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
        },
        sun: "#fbbf24",
        wind: "#38bdf8",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(74,222,128,0.25), 0 8px 30px rgba(34,197,94,0.12)",
      },
    },
  },
  plugins: [],
};
