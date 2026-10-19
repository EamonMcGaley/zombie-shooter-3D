import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths, so the built game works from any web address, including a
  // sub-folder like https://<name>.github.io/<repo>/.
  base: './',
});
