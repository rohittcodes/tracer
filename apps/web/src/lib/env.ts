import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

function findProjectRoot(startPath: string = process.cwd()): string {
  let current = resolve(startPath);
  while (current !== resolve(current, '..')) {
    if (existsSync(resolve(current, 'package.json')) && existsSync(resolve(current, 'turbo.json'))) {
      return current;
    }
    current = resolve(current, '..');
  }
  return process.cwd();
}

let envLoaded = false;

export function loadEnv() {
  if (envLoaded) return;

  const rootDir = findProjectRoot();
  const envPath = resolve(rootDir, '.env');

  if (existsSync(envPath)) {
    const result = config({ path: envPath });
    if (result.error) {
      console.warn('Warning: Failed to load .env file:', result.error.message);
    } else {
      const loadedVars = Object.keys(result.parsed || {}).length;
      if (loadedVars > 0) {
        console.log(`✓ Loaded ${loadedVars} environment variables from .env`);
      }
    }
  } else {
    console.warn(`⚠️  .env file not found at ${envPath}`);
    console.warn('   Make sure DATABASE_URL is set in your environment or create a .env file in the project root.');
  }

  envLoaded = true;
}

