import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy API calls to the backend so there are no CORS issues.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: true, // accept public tunnel hostnames (e.g. *.loca.lt)
    proxy: {
      "/api": "http://localhost:4000",
      "/health": "http://localhost:4000",
    },
  },
});
