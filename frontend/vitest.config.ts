import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Resolve the `@/` path alias for tests (mirrors tsconfig paths) and default to
// the node environment. React lifecycle tests opt into a DOM per-file via the
// `// @vitest-environment happy-dom` docblock, so pure tests stay fast in node.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
  },
});
