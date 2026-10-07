import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  // older iPhones and iPads stay on old Safari versions for years
  build: { target: ["es2020", "safari14"], cssTarget: ["safari14"], chunkSizeWarningLimit: 800 },
});
