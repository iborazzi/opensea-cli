import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput, outputGet } from "../output.js"
import type {
  AgentAccountStatusResponse,
  AgentRelationshipMutationResponse,
  AgentRelationshipRemovalResponse,
  AgentRelationshipRole,
} from "../types/index.js"

const ROLE_DESCRIPTION =
  "Which side you are on: AGENT (this account owns me) or OWNER (I own the counterparty)"

const ROLES: readonly AgentRelationshipRole[] = ["AGENT", "OWNER"]

/**
 * Accept `agent`/`owner` in any case so the flag is not shouty to type, but
 * send the uppercase wire value the API validates against.
 */
function parseRole(value: string): AgentRelationshipRole {
  const normalized = value.trim().toUpperCase()
  if (!ROLES.includes(normalized as AgentRelationshipRole)) {
    throw new Error(
      `Invalid value for --role: "${value}". Expected AGENT or OWNER.`,
    )
  }
  return normalized as AgentRelationshipRole
}

/**
 * `agent` command group: declare an account an agent and run the two-sided
 * ownership handshake.
 *
 * An agent is an account, not a flag on a wallet, and ownership is a
 * relationship between two accounts that both confirm. It is a declaration,
 * not an authorization, and it is self-reported rather than verified.
 */
export function agentCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("agent").description(
    "Declare an agent account and manage agent ownership relationships " +
      "(wallet auth required; writes need write:wallets, list needs read:wallets)",
  )

  cmd
    .command("declare")
    .description(
      "Declare the authenticated account an agent (requires write:wallets). " +
        "Self-reported, not OpenSea verification. An agent nobody owns is valid.",
    )
    .action(async () => {
      const client = getClient()
      const result = await client.put<AgentAccountStatusResponse>(
        "/api/v2/accounts/agent",
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("withdraw")
    .description(
      "Withdraw the authenticated account's agent declaration " +
        "(requires write:wallets)",
    )
    .action(async () => {
      const client = getClient()
      const result = await client.delete<AgentAccountStatusResponse>(
        "/api/v2/accounts/agent",
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("propose")
    .description(
      "Propose an agent ownership relationship (requires write:wallets). " +
        "Proposing one already awaiting you confirms it, so if you cannot " +
        "tell who moved first, just propose.",
    )
    .argument("<counterparty_address>", "Wallet address of the other account")
    .requiredOption("--role <role>", ROLE_DESCRIPTION)
    .action(async (counterpartyAddress: string, options: { role: string }) => {
      const client = getClient()
      const result = await client.post<AgentRelationshipMutationResponse>(
        "/api/v2/accounts/agent-relationships",
        {
          counterparty_address: counterpartyAddress,
          caller_role: parseRole(options.role),
        },
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("confirm")
    .description(
      "Confirm a relationship proposed to the authenticated account " +
        "(requires write:wallets)",
    )
    .argument("<counterparty_address>", "Wallet address of the other account")
    .requiredOption("--role <role>", ROLE_DESCRIPTION)
    .action(async (counterpartyAddress: string, options: { role: string }) => {
      const client = getClient()
      const result = await client.post<AgentRelationshipMutationResponse>(
        "/api/v2/accounts/agent-relationships/confirm",
        {
          counterparty_address: counterpartyAddress,
          caller_role: parseRole(options.role),
        },
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("revoke")
    .description(
      "Withdraw a proposal or revoke a confirmed relationship " +
        "(requires write:wallets). Either side may do this at any time. " +
        "`removed` is false when no such relationship existed.",
    )
    .argument("<counterparty_address>", "Wallet address of the other account")
    .requiredOption("--role <role>", ROLE_DESCRIPTION)
    .action(async (counterpartyAddress: string, options: { role: string }) => {
      const client = getClient()
      // Query parameters, not a body: fetch, OkHttp and urllib all drop
      // DELETE bodies by default and proxies may strip them.
      const result = await client.delete<AgentRelationshipRemovalResponse>(
        "/api/v2/accounts/agent-relationships",
        undefined,
        {
          counterparty_address: counterpartyAddress,
          caller_role: parseRole(options.role),
        },
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("list")
    .description(
      "List the authenticated account's own relationships, including " +
        "pending proposals (requires read:wallets, not write:wallets)",
    )
    .action(async () => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        "/api/v2/accounts/agent-relationships",
      )
    })

  cmd
    .command("profile")
    .description(
      "Get the public agent relationships for any profile (API key only). " +
        "Shows confirmed relationships; pending proposals stay private.",
    )
    .argument("<address_or_username>", "Wallet address or OpenSea username")
    .action(async (addressOrUsername: string) => {
      const client = getClient()
      await outputGet(
        client,
        getFormat(),
        `/api/v2/accounts/${encodeURIComponent(addressOrUsername)}/agent-relationships`,
      )
    })

  return cmd
}
