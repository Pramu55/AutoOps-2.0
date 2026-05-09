import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  target: "node22",
  dts: false,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ["@autoops/database", "@prisma/client", "bullmq", "ioredis"],
});
