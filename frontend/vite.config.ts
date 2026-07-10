import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // 5173/8000 часто заняты другим локальным проектом — используем соседние порты
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:8001"
    }
  }
});
