import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll } from "vitest"

/**
 * Point the CLI's config directory at a throwaway directory for every test file.
 *
 * Without this, anything that reaches `src/auth/store.ts` reads the developer's
 * real `~/.opensea/auth.json`. Tests then pass or fail on whether that machine
 * happens to be logged in: `auth status` asserting `not_authenticated` returns
 * `expired` instead, and it reproduces for nobody who has never run
 * `opensea login`. Writes are just as bad, since a test that saves a token would
 * clobber real credentials.
 *
 * The directory name is deliberately random rather than fixed, because vitest
 * runs test files in parallel workers and a shared path lets two of them race.
 */
let configDir: string

beforeAll(() => {
  configDir = mkdtempSync(join(tmpdir(), "opensea-cli-test-"))
  process.env.OPENSEA_CONFIG_DIR = configDir
})

afterAll(() => {
  delete process.env.OPENSEA_CONFIG_DIR
  rmSync(configDir, { recursive: true, force: true })
})
