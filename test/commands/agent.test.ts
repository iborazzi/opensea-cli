import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { agentCommand } from "../../src/commands/agent.js"
import { type CommandTestContext, createCommandTestContext } from "../mocks.js"

describe("agentCommand", () => {
  let ctx: CommandTestContext

  beforeEach(() => {
    ctx = createCommandTestContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates command with expected subcommands", () => {
    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    const names = cmd.commands.map(c => c.name())
    expect(cmd.name()).toBe("agent")
    expect(names).toEqual([
      "declare",
      "withdraw",
      "propose",
      "confirm",
      "revoke",
      "list",
      "profile",
    ])
  })

  it("declare puts to the account-level agent endpoint with no body", async () => {
    ctx.mockClient.put.mockResolvedValue({ is_agent: true, changed: true })

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["declare"], { from: "user" })

    expect(ctx.mockClient.put).toHaveBeenCalledWith("/api/v2/accounts/agent")
  })

  it("withdraw deletes the declaration", async () => {
    ctx.mockClient.delete.mockResolvedValue({ is_agent: false, changed: true })

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["withdraw"], { from: "user" })

    expect(ctx.mockClient.delete).toHaveBeenCalledWith("/api/v2/accounts/agent")
  })

  it("propose posts the counterparty and the caller's own role", async () => {
    ctx.mockClient.post.mockResolvedValue({ relation: {}, created: true })

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["propose", "0xowner", "--role", "AGENT"], {
      from: "user",
    })

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/accounts/agent-relationships",
      { counterparty_address: "0xowner", caller_role: "AGENT" },
    )
  })

  it("confirm posts to the confirm sub-path", async () => {
    ctx.mockClient.post.mockResolvedValue({ relation: {}, created: false })

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["confirm", "0xagent", "--role", "OWNER"], {
      from: "user",
    })

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/accounts/agent-relationships/confirm",
      { counterparty_address: "0xagent", caller_role: "OWNER" },
    )
  })

  it("revoke sends query params and no body", async () => {
    ctx.mockClient.delete.mockResolvedValue({ removed: true })

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["revoke", "0xowner", "--role", "AGENT"], {
      from: "user",
    })

    // The third argument is the query params. The body (second) stays
    // undefined because fetch, OkHttp and urllib all drop DELETE bodies.
    expect(ctx.mockClient.delete).toHaveBeenCalledWith(
      "/api/v2/accounts/agent-relationships",
      undefined,
      { counterparty_address: "0xowner", caller_role: "AGENT" },
    )
  })

  it("accepts a lowercase role and sends the uppercase wire value", async () => {
    ctx.mockClient.post.mockResolvedValue({ relation: {}, created: true })

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["propose", "0xowner", "--role", "owner"], {
      from: "user",
    })

    expect(ctx.mockClient.post).toHaveBeenCalledWith(
      "/api/v2/accounts/agent-relationships",
      { counterparty_address: "0xowner", caller_role: "OWNER" },
    )
  })

  it("rejects a role that is neither AGENT nor OWNER", async () => {
    const cmd = agentCommand(ctx.getClient, ctx.getFormat)

    await expect(
      cmd.parseAsync(["propose", "0xowner", "--role", "BOTH"], {
        from: "user",
      }),
    ).rejects.toThrow(
      'Invalid value for --role: "BOTH". Expected AGENT or OWNER.',
    )
    expect(ctx.mockClient.post).not.toHaveBeenCalled()
  })

  it("requires a role for propose", async () => {
    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    cmd.exitOverride()

    await expect(
      cmd.parseAsync(["propose", "0xowner"], { from: "user" }),
    ).rejects.toThrow()
    expect(ctx.mockClient.post).not.toHaveBeenCalled()
  })

  it("list reads the caller's own relationships", async () => {
    ctx.mockClient.get.mockResolvedValue({ relationships: [] })

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["list"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/accounts/agent-relationships",
    )
  })

  it("profile reads the public relationships for an identifier", async () => {
    ctx.mockClient.get.mockResolvedValue({})

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["profile", "imatestagent123"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/accounts/imatestagent123/agent-relationships",
    )
  })

  it("profile percent-encodes the identifier", async () => {
    ctx.mockClient.get.mockResolvedValue({})

    const cmd = agentCommand(ctx.getClient, ctx.getFormat)
    await cmd.parseAsync(["profile", "alice/example"], { from: "user" })

    expect(ctx.mockClient.get).toHaveBeenCalledWith(
      "/api/v2/accounts/alice%2Fexample/agent-relationships",
    )
  })
})
