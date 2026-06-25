import { cloudflare } from "@cloudflare/vite-plugin";
import { think } from "@cloudflare/think/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [think({ routePrefix: "/agents" }), cloudflare()],
});
