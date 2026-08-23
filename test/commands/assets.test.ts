import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { assetsCommand } from "../../src/commands/assets.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

describe("assetsCommand", () => {
  let ctx: CommandTestContext
  let dir: string

  beforeEach(() => {
    ctx = createCommandTestContext()
    dir = mkdtempSync(join(tmpdir(), "assets-test-"))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  it("creates command with correct subcommands", () => {
    const cmd = assetsCommand(ctx.getClient, ctx.getFormat)
    expect(cmd.name()).toBe("assets")
    const subcommands = cmd.commands.map(c => c.name())
    expect(subcommands).toContain("transfer")
  })

  it("transfer subcommand reads body file and posts it", async () => {
    const bodyPath = join(dir, "transfer.json")
    const body = { chain: "base", to: "0xabc", amount: "1" }
    writeFileSync(bodyPath, JSON.stringify(body))
    ctx.mockClient.post.mockResolvedValue({ transactions: [] })

    const cmd = assetsCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["transfer", "--body", bodyPath], { from: "user" })

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/assets/transfer",
      body,
    )
  })

  it("transfer subcommand throws when --body file does not exist", async () => {
    const cmd = assetsCommand(ctx.getClient, ctx.getFormat)
    await expect(
      cmd.parseAsync(
        ["transfer", "--body", join(dir, "does-not-exist.json")],
        { from: "user" },
      ),
    ).rejects.toThrow(/Could not read --body/)
  })

  it("transfer subcommand throws when --body file is invalid JSON", async () => {
    const bodyPath = join(dir, "bad.json")
    writeFileSync(bodyPath, "{ not valid json")

    const cmd = assetsCommand(ctx.getClient, ctx.getFormat)
    await expect(
      cmd.parseAsync(["transfer", "--body", bodyPath], { from: "user" }),
    ).rejects.toThrow(/Could not parse --body/)
  })
})
