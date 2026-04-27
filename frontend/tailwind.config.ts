import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#0F2B4C",
          teal: "#0D7A5F",
          tealLight: "#E1F5EE",
        },
        status: {
          amber: "#BA7517",
          amberLight: "#FAEEDA",
          red: "#A32D2D",
          redLight: "#FCEBEB",
          purple: "#534AB7",
          purpleLight: "#EEEDFE",
        },
        ui: {
          grey: "#5F5E5A",
          greyLight: "#F1EFE8",
          greyBorder: "#D3D1C7",
          nearBlack: "#1A1A1A",
        },
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,0.06)",
        md: "0 4px 12px rgba(0,0,0,0.08)",
      },
      width: {
        sidebar: "180px",
      },
    },
  },
  plugins: [],
};
export default config;