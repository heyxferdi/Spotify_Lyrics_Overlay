import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default ({ mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };

  return defineConfig({
    plugins: [react()],

    // relative paths so the built app also works when opened from a file (.exe)
    base: "./",

    server: {
      // 127.0.0.1 explicitly (dev mode only)
      host: "127.0.0.1",
      port: parseInt(process.env.VITE_PORT) || 3000,
    },
  });
};
