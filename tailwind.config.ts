import type { Config } from "tailwindcss";

const rgb = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 新版语义色
        surface: {
          DEFAULT: rgb("--bg-base-rgb"),
          container: rgb("--bg-panel-rgb"),
          low: rgb("--bg-inset-rgb"),
          high: rgb("--bg-card-rgb"),
          highest: rgb("--bg-elevated-rgb"),
          hover: rgb("--bg-hover-rgb"),
          active: rgb("--bg-active-rgb"),
          variant: rgb("--bg-elevated-rgb"),
        },
        // 兼容旧版容器命名，保证历史页面同步使用新配色
        "surface-container": rgb("--bg-panel-rgb"),
        shell: "var(--shell-surface)",
        "surface-container-lowest": rgb("--bg-inset-rgb"),
        "surface-container-low": rgb("--bg-inset-rgb"),
        "surface-container-high": rgb("--bg-card-rgb"),
        "surface-container-highest": rgb("--bg-elevated-rgb"),
        "on-surface": {
          DEFAULT: rgb("--fg-rgb"),
          variant: rgb("--fg-muted-rgb"),
          subtle: rgb("--fg-subtle-rgb"),
        },
        outline: {
          // 边框颜色随主题主色变化，而不是固定的灰白色
          DEFAULT: "var(--border-color-strong)",
          variant: "var(--border-color-variant)",
        },
        primary: {
          DEFAULT: rgb("--accent-rgb"),
          container: "var(--accent-soft)",
          muted: "var(--accent-muted)",
          border: "var(--accent-border)",
        },
        "on-primary": {
          DEFAULT: rgb("--on-accent-rgb"),
          container: "var(--accent-color)",
        },
        /* 辅助点缀色：用于分类图标、状态与卡片高光 */
        violet: {
          DEFAULT: rgb("--violet-rgb"),
          container: "rgb(var(--violet-rgb) / 0.12)",
          border: "rgb(var(--violet-rgb) / 0.32)",
        },
        cyan: {
          DEFAULT: rgb("--cyan-rgb"),
          container: "rgb(var(--cyan-rgb) / 0.12)",
          border: "rgb(var(--cyan-rgb) / 0.32)",
        },
        pink: {
          DEFAULT: rgb("--pink-rgb"),
          container: "rgb(var(--pink-rgb) / 0.12)",
          border: "rgb(var(--pink-rgb) / 0.32)",
        },
        amber: {
          DEFAULT: rgb("--amber-rgb"),
          container: "rgb(var(--amber-rgb) / 0.14)",
          border: "rgb(var(--amber-rgb) / 0.34)",
        },
        mint: {
          DEFAULT: rgb("--mint-rgb"),
          container: "rgb(var(--mint-rgb) / 0.12)",
          border: "rgb(var(--mint-rgb) / 0.32)",
        },
        sky: {
          DEFAULT: rgb("--sky-rgb"),
          container: "rgb(var(--sky-rgb) / 0.12)",
          border: "rgb(var(--sky-rgb) / 0.32)",
        },
        success: {
          DEFAULT: rgb("--success-rgb"),
          container: "rgb(var(--success-rgb) / 0.12)",
          border: "rgb(var(--success-rgb) / 0.32)",
        },
        "on-success": "rgb(var(--success-rgb))",
        warning: {
          DEFAULT: rgb("--warning-rgb"),
          container: "rgb(var(--warning-rgb) / 0.12)",
          border: "rgb(var(--warning-rgb) / 0.32)",
        },
        "on-warning": "rgb(var(--warning-rgb))",
        danger: {
          DEFAULT: rgb("--danger-rgb"),
          container: "rgb(var(--danger-rgb) / 0.12)",
          border: "rgb(var(--danger-rgb) / 0.32)",
        },
        error: {
          DEFAULT: rgb("--danger-rgb"),
          container: "rgb(var(--danger-rgb) / 0.12)",
        },
        "on-error": rgb("--on-accent-rgb"),
        "on-error-container": "rgb(var(--danger-rgb))",
        secondary: {
          DEFAULT: rgb("--fg-muted-rgb"),
          container: rgb("--bg-hover-rgb"),
        },
        "on-secondary": rgb("--bg-card-rgb"),
        "on-secondary-container": rgb("--fg-rgb"),
        tertiary: {
          DEFAULT: rgb("--warning-rgb"),
          container: "rgb(var(--warning-rgb) / 0.12)",
        },
        "on-tertiary": rgb("--bg-card-rgb"),
        "on-tertiary-container": rgb("--warning-rgb"),
        inverse: {
          surface: rgb("--fg-rgb"),
          "on-surface": rgb("--bg-card-rgb"),
          primary: rgb("--accent-rgb"),
        },
        scrim: "rgba(var(--scrim-rgb), var(--scrim-opacity))",
        shadow: "rgba(0, 0, 0, 0.3)",
      },
      opacity: {
        8: "0.08",
        12: "0.12",
        14: "0.14",
        15: "0.15",
        16: "0.16",
        26: "0.26",
        35: "0.35",
        45: "0.45",
        55: "0.55",
        65: "0.65",
        85: "0.85",
      },
      backgroundImage: {
        brand: "var(--grad-brand)",
        hero: "var(--grad-hero)",
        soft: "var(--grad-soft)",
        aurora: "none",
      },
      borderRadius: {
        card: "10px",
        btn: "8px",
        input: "8px",
        window: "8px",
        "md-none": "0px",
        "md-xs": "4px",
        "md-sm": "6px",
        "md-md": "8px",
        "md-lg": "12px",
        "md-xl": "16px",
        "md-full": "9999px",
      },
      fontFamily: {
        sans: [
          '"Segoe UI Variable Text"',
          '"Segoe UI"',
          '"Microsoft YaHei UI"',
          '"Microsoft YaHei"',
          '"PingFang SC"',
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        elevated: "var(--shadow-elevated)",
        dialog: "var(--shadow-dialog)",
        glow: "none",
        brand: "0 1px 2px rgba(19, 112, 243, 0.16)",
        violet: "none",
        "md-0": "none",
        "md-1": "var(--shadow-card)",
        "md-2": "var(--shadow-card)",
        "md-3": "var(--shadow-elevated)",
        "md-4": "var(--shadow-elevated)",
        "md-5": "var(--shadow-elevated)",
      },
      backdropBlur: {
        glass: "20px",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.2, 0, 0, 1)",
        "standard-decelerate": "cubic-bezier(0, 0, 0, 1)",
        "standard-accelerate": "cubic-bezier(0.3, 0, 1, 1)",
        "emphasized-decelerate": "cubic-bezier(0.2, 0, 0, 1)",
        "emphasized-accelerate": "cubic-bezier(0.3, 0, 1, 1)",
        legacy: "cubic-bezier(0.4, 0, 0.2, 1)",
        "ease-out-back": "cubic-bezier(0.2, 0, 0, 1)",
      },
      transitionDuration: {
        "150": "150ms",
        "250": "180ms",
        "350": "220ms",
        "450": "260ms",
      },
      animation: {
        "fade-in": "fadeIn 0.15s ease-out forwards",
        "slide-up": "slideUp 0.18s ease-out forwards",
        "slide-up-small": "slideUpSmall 0.16s ease-out forwards",
        "scale-in": "scaleIn 0.16s ease-out forwards",
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideUpSmall: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.985)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.65" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
