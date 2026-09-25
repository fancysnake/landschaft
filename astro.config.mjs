// @ts-check
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  // Bundle every dependency into the server build so dist/ runs from anywhere (the CLI writes
  // it into the consumer directory, away from any node_modules).
  vite: { plugins: [tailwindcss()], ssr: { noExternal: true } },
});
