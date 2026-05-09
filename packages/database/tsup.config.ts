import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
  },
  format: ["esm", "cjs"],
  dts: false,
  sourcemap: true,
  clean: true,
  external: ["@prisma/client"],
});
