/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        harbor: {
          50: "#eef7f8",
          100: "#d5ebee",
          200: "#abd5db",
          300: "#6fb4bf",
          400: "#3d8f9e",
          500: "#247484",
          600: "#1e5d6b",
          700: "#1c4c58",
          800: "#1b404a",
          900: "#1a3740",
          950: "#0c2128",
        },
        steel: {
          400: "#8b9bab",
          500: "#64748b",
          700: "#334155",
          900: "#0f172a",
        },
        alert: {
          green: "#16a34a",
          orange: "#ea580c",
          red: "#dc2626",
        },
      },
      fontFamily: {
        display: ["\"Space Grotesk\"", "system-ui", "sans-serif"],
        body: ["\"IBM Plex Sans\"", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "harbor-grid":
          "linear-gradient(rgba(26,55,64,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(26,55,64,0.06) 1px, transparent 1px)",
        "harbor-wash":
          "radial-gradient(ellipse at 20% 0%, rgba(61,143,158,0.25), transparent 50%), radial-gradient(ellipse at 90% 20%, rgba(234,88,12,0.12), transparent 40%), linear-gradient(165deg, #f4f8f9 0%, #e8f1f3 45%, #dfe9ec 100%)",
      },
      backgroundSize: {
        grid: "48px 48px",
      },
    },
  },
  plugins: [],
};
