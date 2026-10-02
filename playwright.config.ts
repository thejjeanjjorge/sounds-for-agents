import { defineConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const repository = import.meta.dirname;
const artifacts = resolve(repository, '.artifacts', 'browser-check');
mkdirSync(artifacts, { recursive: true });
// Chrome's Windows diagnostics must not pollute the repository root.
process.chdir(artifacts);

export default defineConfig({
  testDir: resolve(repository, 'tests/browser'),
  outputDir: resolve(artifacts, 'results'),
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    headless: true,
    launchOptions: { args: ['--mute-audio', '--disable-logging'] },
  },
});
