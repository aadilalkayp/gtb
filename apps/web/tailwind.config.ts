import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantic tokens -> CSS variables defined in src/index.css
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          muted: "hsl(var(--sidebar-muted))",
          active: "hsl(var(--sidebar-active))",
        },
        background: "hsl(var(--background))",
        surface: "hsl(var(--surface))",
        // Border tokens MUST stay flat keys — nesting under `border` collides
        // with the border-width utility and silently breaks the build.
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          hover: "hsl(var(--primary-hover))",
          foreground: "hsl(var(--primary-foreground))",
        },
        ring: "hsl(var(--ring))",
        // Brand accents — switch with client type (groom = teal, bride = rose)
        groom: "hsl(var(--groom))",
        bride: "hsl(var(--bride))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",
        info: "hsl(var(--info))",
      },
      borderRadius: {
        card: "0.875rem",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
      },
      letterSpacing: {
        display: "-0.02em",
      },
      boxShadow: {
        // Warm-tinted elevation ladder
        card: "0 1px 2px 0 hsl(30 10% 10% / 0.04), 0 1px 3px 0 hsl(30 10% 10% / 0.05)",
        md: "0 2px 4px -1px hsl(30 10% 10% / 0.05), 0 4px 10px -2px hsl(30 10% 10% / 0.07)",
        lg: "0 4px 8px -2px hsl(30 10% 10% / 0.06), 0 12px 24px -4px hsl(30 10% 10% / 0.1)",
        xl: "0 8px 16px -4px hsl(30 10% 10% / 0.08), 0 24px 48px -8px hsl(30 10% 10% / 0.14)",
        button: "inset 0 1px 0 0 hsl(0 0% 100% / 0.12), 0 1px 2px 0 hsl(30 10% 10% / 0.1)",
        xs: "0 1px 2px 0 hsl(30 10% 10% / 0.05)",
      },
      transitionTimingFunction: {
        "out-strong": "cubic-bezier(0.23, 1, 0.32, 1)",
        "in-out-strong": "cubic-bezier(0.77, 0, 0.175, 1)",
      },
      animation: {
        "fade-up": "fade-up 0.45s cubic-bezier(0.23, 1, 0.32, 1) both",
        "fade-in": "fade-in 0.15s ease-out both",
        "scale-in": "scale-in 0.2s cubic-bezier(0.23, 1, 0.32, 1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
