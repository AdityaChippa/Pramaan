import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0C0C0C",
        panel: "#121212",
        fog: "#D7E2EA",
        muted: "rgba(215,226,234,0.6)",
        hairline: "rgba(215,226,234,0.12)",
        authentic: "#3DDC97",
        inconclusive: "#F5A524",
        manipulated: "#FF4D5E",
      },
      fontFamily: {
        sans: ["var(--font-kanit)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      transitionTimingFunction: { spec: "cubic-bezier(0.25, 0.1, 0.25, 1)" },
      borderColor: { DEFAULT: "rgba(215,226,234,0.12)" },
    },
  },
  plugins: [],
};
export default config;
