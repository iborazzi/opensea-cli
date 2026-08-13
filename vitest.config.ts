import { readFileSync } from "node:fs"
import { defineConfig, mergeConfig } from "vitest/config"
import baseConfig from "./vitest.config.base"

const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as {
  version: string
}

export default mergeConfig(
  baseConfig,
  defineConfig({
    define: {
      __VERSION__: JSON.stringify(pkg.version),
    },
    test: {
      // Redirects the CLI config directory away from the developer's real
      // ~/.opensea for every test file. See test/setup.ts.
      setupFiles: ["./test/setup.ts"],
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov"],
        include: ["src/**/*.ts"],
        exclude: ["src/types/**"],
      },
    },
  }),
)
