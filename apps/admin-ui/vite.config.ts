import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  const backendOrigin =
    environment.VITE_DEV_BACKEND_ORIGIN?.trim() || "http://localhost:5000";

  return {
    base: "/admin/",
    plugins: [react()],
    server: {
      port: 5175,
      proxy: {
        "/api": { target: backendOrigin, changeOrigin: true },
      },
    },
  };
});
