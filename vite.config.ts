import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // NEXT_PUBLIC_* nastavi Supabase integracija na Vercelu (javne vrednosti:
  // URL in publishable key). Skrivnosti brez teh predpon (SUPABASE_SECRET_KEY,
  // SUPABASE_SERVICE_ROLE_KEY, POSTGRES_*) ne pridejo v brskalnik.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
});
