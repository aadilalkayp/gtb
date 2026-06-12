import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Split the always-loaded vendors into their own chunks so no single
        // file trips Vite's 500 kB warning. recharts is deliberately NOT listed
        // here: it's only reached through the lazy dashboard/reports routes, so
        // Rollup's dynamic-import boundary already gives it its own async chunk
        // that stays out of the initial load. Forcing it into a manual chunk
        // instead pulls shared micro-utils (e.g. tiny-invariant) in with it and
        // creates an eager static edge, defeating the lazy split. Unmatched
        // modules fall back to Rollup's default chunking.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/@supabase/")) return "supabase";
          if (id.includes("/react-router") || id.includes("/@remix-run/")) return "router";
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
            return "react";
          }
          return undefined;
        },
      },
    },
  },
});
