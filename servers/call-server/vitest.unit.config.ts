import { defineConfig } from "vitest/config";

export default defineConfig({ test: { environment: "node", fileParallelism: false, include: ["tests/call-server.test.ts"], setupFiles: ["./tests/unit.setup.ts"] } });
