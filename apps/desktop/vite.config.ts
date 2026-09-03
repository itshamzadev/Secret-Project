import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/renderer",
  plugins: [react()],
  server: { port: 5174 },
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
  },
});
