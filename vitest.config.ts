import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: { exclude: [...configDefaults.exclude, 'dist/**', 'dist-electron/**', 'release/**', 'work/**', 'scripts/eac-trace-summary.test.mjs'] },
});
