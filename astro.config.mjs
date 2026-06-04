// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Static site (default output): the workbench is a client-side React island, so
// no SSR adapter is needed.
export default defineConfig({
  integrations: [react()],
  vite: {
    // Cast: astro's bundled rolldown-vite and the standalone vite expose
    // structurally-different Plugin types; the plugin works at runtime.
    plugins: [/** @type {any} */ (tailwindcss())],
  },
});
