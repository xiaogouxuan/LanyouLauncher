import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 兼容旧 Token
        "bg-primary": "var(--color-bg-primary)",
        "bg-secondary": "var(--color-bg-secondary)",
        "bg-card": "var(--color-bg-card)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        border: "var(--color-border)",
        accent: "var(--color-accent)",
        "accent-hover": "var(--color-accent-hover)",
        "glass-bg": "var(--color-glass-bg)",

        // Material Design 3 Expressive Token
        primary: {
          DEFAULT: "var(--md-sys-color-primary)",
          container: "var(--md-sys-color-primary-container)",
        },
        "on-primary": "var(--md-sys-color-on-primary)",
        "on-primary-container": "var(--md-sys-color-on-primary-container)",
        secondary: {
          DEFAULT: "var(--md-sys-color-secondary)",
          container: "var(--md-sys-color-secondary-container)",
        },
        "on-secondary": "var(--md-sys-color-on-secondary)",
        "on-secondary-container": "var(--md-sys-color-on-secondary-container)",
        tertiary: {
          DEFAULT: "var(--md-sys-color-tertiary)",
          container: "var(--md-sys-color-tertiary-container)",
        },
        "on-tertiary": "var(--md-sys-color-on-tertiary)",
        "on-tertiary-container": "var(--md-sys-color-on-tertiary-container)",
        error: {
          DEFAULT: "var(--md-sys-color-error)",
          container: "var(--md-sys-color-error-container)",
        },
        "on-error": "var(--md-sys-color-on-error)",
        "on-error-container": "var(--md-sys-color-on-error-container)",
        surface: {
          DEFAULT: "var(--md-sys-color-surface)",
          variant: "var(--md-sys-color-surface-variant)",
          container: {
            lowest: "var(--md-sys-color-surface-container-lowest)",
            low: "var(--md-sys-color-surface-container-low)",
            DEFAULT: "var(--md-sys-color-surface-container)",
            high: "var(--md-sys-color-surface-container-high)",
            highest: "var(--md-sys-color-surface-container-highest)",
          },
        },
        "on-surface": {
          DEFAULT: "var(--md-sys-color-on-surface)",
          variant: "var(--md-sys-color-on-surface-variant)",
        },
        outline: {
          DEFAULT: "var(--md-sys-color-outline)",
          variant: "var(--md-sys-color-outline-variant)",
        },
        inverse: {
          surface: "var(--md-sys-color-inverse-surface)",
          "on-surface": "var(--md-sys-color-inverse-on-surface)",
          primary: "var(--md-sys-color-inverse-primary)",
        },
        scrim: "var(--md-sys-color-scrim)",
        shadow: "var(--md-sys-color-shadow)",
      },
      borderRadius: {
        card: "var(--radius-card)",
        btn: "var(--radius-btn)",
        input: "var(--radius-input)",
        window: "var(--radius-window)",
        "md-none": "var(--md-sys-shape-corner-none)",
        "md-xs": "var(--md-sys-shape-corner-extra-small)",
        "md-sm": "var(--md-sys-shape-corner-small)",
        "md-md": "var(--md-sys-shape-corner-medium)",
        "md-lg": "var(--md-sys-shape-corner-large)",
        "md-xl": "var(--md-sys-shape-corner-extra-large)",
        "md-full": "var(--md-sys-shape-corner-full)",
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', "sans-serif"],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        elevated: "var(--shadow-elevated)",
        glow: "var(--shadow-glow)",
        "md-0": "var(--md-sys-elevation-level0)",
        "md-1": "var(--md-sys-elevation-level1)",
        "md-2": "var(--md-sys-elevation-level2)",
        "md-3": "var(--md-sys-elevation-level3)",
        "md-4": "var(--md-sys-elevation-level4)",
        "md-5": "var(--md-sys-elevation-level5)",
      },
      backdropBlur: {
        glass: "20px",
      },
      transitionTimingFunction: {
        // Material Design 3 标准缓动
        "standard": "cubic-bezier(0.2, 0.0, 0.0, 1.0)",
        "standard-decelerate": "cubic-bezier(0.0, 0.0, 0.0, 1.0)",
        "standard-accelerate": "cubic-bezier(0.3, 0.0, 1.0, 1.0)",
        "emphasized-decelerate": "cubic-bezier(0.05, 0.7, 0.1, 1.0)",
        "emphasized-accelerate": "cubic-bezier(0.3, 0.0, 0.8, 0.15)",
        "legacy": "cubic-bezier(0.4, 0.0, 0.2, 1.0)",
        "ease-out-back": "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
      },
      transitionDuration: {
        "150": "150ms",
        "250": "250ms",
        "350": "350ms",
        "450": "450ms",
      },
      animation: {
        "fade-in": "fadeIn 0.25s standard-decelerate forwards",
        "slide-up": "slideUp 0.35s emphasized-decelerate forwards",
        "slide-up-small": "slideUpSmall 0.3s standard-decelerate forwards",
        "scale-in": "scaleIn 0.3s emphasized-decelerate forwards",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideUpSmall: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
