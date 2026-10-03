import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBaseUrl = env.VITE_API_BASE_URL ?? "";

  return {
    base: mode === "production" ? "/Nahjul-Balagha/" : "/",
    plugins: [react()],
    define: {
      "process.env.VITE_API_BASE_URL": JSON.stringify(apiBaseUrl),
    },
    server: {
      proxy: {
        "/api": {
          target: apiBaseUrl,
          changeOrigin: true,
        },
      },
    },
  };
});
