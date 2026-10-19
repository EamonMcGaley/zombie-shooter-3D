import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths, so the built game works from any web address, including a
  // sub-folder like https://<name>.github.io/<repo>/.
  base: './',
  test: {
    // GitHub's build computers can be slower than a PC, and the map tests
    // check 100 maps each, so give each test more time before failing.
    testTimeout: 20000,
  },
});
