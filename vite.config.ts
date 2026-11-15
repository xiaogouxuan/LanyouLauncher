import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "fs";

const host = process.env.TAURI_DEV_HOST;

// 版本号以 Tauri 打包配置为准，避免前端硬编码与安装包版本不一致
const tauriConfig = JSON.parse(
  readFileSync(path.resolve(__dirname, "src-tauri/tauri.conf.json"), "utf-8"),
) as { version: string };

export default defineConfig(async () => ({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(tauriConfig.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));