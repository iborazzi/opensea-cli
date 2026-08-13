import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  getAuthDir,
  listTokens,
  loadCurrentToken,
  loadToken,
  saveToken,
} from "../../src/auth/store.js"

// Each test gets its own config directory via OPENSEA_CONFIG_DIR, so nothing
// here can read or overwrite the developer's real ~/.opensea/auth.json. A unique
// directory per test also keeps parallel test files from racing on one path.
let authDir: string

const baseToken = {
  accessToken: "access",
  refreshToken: "refresh",
  expiresAt: "2030-01-01T00:00:00.000Z",
  requestedScopes: ["read:eligibility"],
  scopes: ["read:eligibility"],
  address: "0xAbC",
  authMethod: "oauth" as const,
}

beforeEach(() => {
  process.env.OPENSEA_CONFIG_DIR = mkdtempSync(
    join(tmpdir(), "opensea-auth-store-test-"),
  )
  authDir = getAuthDir()
})

afterEach(() => {
  rmSync(authDir, { recursive: true, force: true })
  delete process.env.OPENSEA_CONFIG_DIR
  vi.restoreAllMocks()
})

describe("auth store", () => {
  test("stores EVM addresses case-insensitively", () => {
    saveToken(baseToken)

    expect(loadCurrentToken()).toEqual(baseToken)
    expect(loadToken("0xabc")).toEqual(baseToken)
    expect(loadToken("0xABC")).toEqual(baseToken)
    expect(loadToken("0XABC")).toEqual(baseToken)
  })

  test("preserves case-sensitive Solana addresses", () => {
    const solanaToken = {
      ...baseToken,
      address: "SoLanaCaseSensitiveAddress123",
    }
    saveToken(solanaToken)

    expect(loadCurrentToken()).toEqual(solanaToken)
    expect(loadToken("SoLanaCaseSensitiveAddress123")).toEqual(solanaToken)
    expect(loadToken("solanacasesensitiveaddress123")).toBeUndefined()
  })

  test.skipIf(process.platform === "win32")(
    "repairs permissive auth directory and file modes",
    () => {
      mkdirSync(`${authDir}`, { recursive: true, mode: 0o755 })
      writeFileSync(`${authDir}/auth.json`, JSON.stringify({ tokens: {} }))
      chmodSync(`${authDir}`, 0o755)
      chmodSync(`${authDir}/auth.json`, 0o644)

      saveToken(baseToken)

      expect(statSync(`${authDir}`).mode & 0o777).toBe(0o700)
      expect(statSync(`${authDir}/auth.json`).mode & 0o777).toBe(0o600)
    },
  )

  test.skipIf(process.platform === "win32")(
    "refuses to follow an auth file symlink",
    () => {
      const target = `${authDir}/target.json`
      mkdirSync(`${authDir}`, { recursive: true })
      writeFileSync(target, "do not overwrite", { mode: 0o644 })
      symlinkSync(target, `${authDir}/auth.json`)

      expect(() => saveToken(baseToken)).toThrow(
        "auth store path is not a regular file",
      )
      expect(readFileSync(target, "utf8")).toBe("do not overwrite")
      expect(statSync(target).mode & 0o777).toBe(0o644)
    },
  )

  test("lists tokens without deriving or rewriting persisted scopes", () => {
    saveToken(baseToken)
    saveToken({
      ...baseToken,
      address: "0xdef",
      scopes: ["write:orders"],
    })

    expect(listTokens().map(token => token.scopes)).toEqual([
      ["read:eligibility"],
      ["write:orders"],
    ])
  })

  test("stores the scoped token id used by SIWE revocation", () => {
    const siweToken = {
      ...baseToken,
      authMethod: "siwe" as const,
      scopedTokenId: "381768924447939181",
      sessionCookie: "access_token=session; refresh_token=refresh",
    }

    saveToken(siweToken)

    expect(loadCurrentToken()).toEqual(siweToken)
  })

  test("rejects SIWE stores without session management credentials", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    mkdirSync(`${authDir}`, { recursive: true })
    writeFileSync(
      `${authDir}/auth.json`,
      JSON.stringify({
        currentAddress: "0xabc",
        tokens: {
          "0xabc": {
            ...baseToken,
            address: "0xabc",
            authMethod: "siwe",
            scopedTokenId: "pat-id",
          },
        },
      }),
    )

    expect(loadCurrentToken()).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("corrupted or incompatible"),
    )
  })

  test("rejects prerelease stores missing requested scopes", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    mkdirSync(`${authDir}`, { recursive: true })
    writeFileSync(
      `${authDir}/auth.json`,
      JSON.stringify({
        currentAddress: "0xabc",
        tokens: {
          "0xabc": {
            accessToken: "access",
            refreshToken: "refresh",
            expiresAt: "2030-01-01T00:00:00.000Z",
            scopes: ["read:eligibility"],
            address: "0xabc",
            authMethod: "oauth",
          },
        },
      }),
    )

    expect(loadCurrentToken()).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("corrupted or incompatible"),
    )
  })

  test("rejects stores whose key does not match the token address", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    mkdirSync(`${authDir}`, { recursive: true })
    writeFileSync(
      `${authDir}/auth.json`,
      JSON.stringify({
        currentAddress: "0xdef",
        tokens: { "0xdef": baseToken },
      }),
    )

    expect(loadCurrentToken()).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
