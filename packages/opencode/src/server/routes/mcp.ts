import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { MCP } from "../../mcp"
import { Config } from "../../config/config"
import { ToolRegistry } from "../../tool/registry"
import { errors } from "../error"
import { lazy } from "../../util/lazy"

const ToolInfo = z.object({
  id: z.string(),
  source: z.enum(["builtin", "mcp"]),
  description: z.string().optional(),
})

export const McpRoutes = lazy(() =>
  new Hono()
    .get(
      "/tools",
      describeRoute({
        summary: "List all available tools",
        description: "List all available tools including built-in and MCP tools.",
        operationId: "mcp.tools",
        responses: {
          200: {
            description: "List of available tools",
            content: {
              "application/json": {
                schema: resolver(z.array(ToolInfo)),
              },
            },
          },
        },
      }),
      async (c) => {
        const builtin = await ToolRegistry.ids()
        const mcpTools = await MCP.tools().catch(() => ({}))
        const result = [
          ...builtin.map((id) => ({ id, source: "builtin" as const })),
          ...Object.entries(mcpTools).map(([id, tool]) => ({
            id,
            source: "mcp" as const,
            description: (tool as any).description,
          })),
        ]
        return c.json(result)
      },
    )
    .get(
      "/",
      describeRoute({
        summary: "Get MCP status",
        description: "Get the status of all Model Context Protocol (MCP) servers.",
        operationId: "mcp.status",
        responses: {
          200: {
            description: "MCP server status",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), MCP.Status)),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await MCP.status())
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Add MCP server",
        description: "Dynamically add a new Model Context Protocol (MCP) server to the system.",
        operationId: "mcp.add",
        responses: {
          200: {
            description: "MCP server added successfully",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), MCP.Status)),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          name: z.string(),
          config: Config.Mcp,
        }),
      ),
      async (c) => {
        const { name, config } = c.req.valid("json")
        const result = await MCP.add(name, config)
        return c.json(result.status)
      },
    )
    .post(
      "/:name/auth",
      describeRoute({
        summary: "Start MCP OAuth",
        description: "Start OAuth authentication flow for a Model Context Protocol (MCP) server.",
        operationId: "mcp.auth.start",
        responses: {
          200: {
            description: "OAuth flow started",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    authorizationUrl: z.string().describe("URL to open in browser for authorization"),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        const supportsOAuth = await MCP.supportsOAuth(name)
        if (!supportsOAuth) {
          return c.json({ error: `MCP server ${name} does not support OAuth` }, 400)
        }
        const result = await MCP.startAuth(name)
        return c.json(result)
      },
    )
    .post(
      "/:name/auth/callback",
      describeRoute({
        summary: "Complete MCP OAuth",
        description:
          "Complete OAuth authentication for a Model Context Protocol (MCP) server using the authorization code.",
        operationId: "mcp.auth.callback",
        responses: {
          200: {
            description: "OAuth authentication completed",
            content: {
              "application/json": {
                schema: resolver(MCP.Status),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "json",
        z.object({
          code: z.string().describe("Authorization code from OAuth callback"),
        }),
      ),
      async (c) => {
        const name = c.req.param("name")
        const { code } = c.req.valid("json")
        const status = await MCP.finishAuth(name, code)
        return c.json(status)
      },
    )
    .post(
      "/:name/auth/authenticate",
      describeRoute({
        summary: "Authenticate MCP OAuth",
        description: "Start OAuth flow and wait for callback (opens browser)",
        operationId: "mcp.auth.authenticate",
        responses: {
          200: {
            description: "OAuth authentication completed",
            content: {
              "application/json": {
                schema: resolver(MCP.Status),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        const supportsOAuth = await MCP.supportsOAuth(name)
        if (!supportsOAuth) {
          return c.json({ error: `MCP server ${name} does not support OAuth` }, 400)
        }
        const status = await MCP.authenticate(name)
        return c.json(status)
      },
    )
    .delete(
      "/:name/auth",
      describeRoute({
        summary: "Remove MCP OAuth",
        description: "Remove OAuth credentials for an MCP server",
        operationId: "mcp.auth.remove",
        responses: {
          200: {
            description: "OAuth credentials removed",
            content: {
              "application/json": {
                schema: resolver(z.object({ success: z.literal(true) })),
              },
            },
          },
          ...errors(404),
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        await MCP.removeAuth(name)
        return c.json({ success: true as const })
      },
    )
    .post(
      "/:name/connect",
      describeRoute({
        description: "Connect an MCP server",
        operationId: "mcp.connect",
        responses: {
          200: {
            description: "MCP server connected successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      validator("param", z.object({ name: z.string() })),
      async (c) => {
        const { name } = c.req.valid("param")
        await MCP.connect(name)
        return c.json(true)
      },
    )
    .post(
      "/:name/disconnect",
      describeRoute({
        description: "Disconnect an MCP server",
        operationId: "mcp.disconnect",
        responses: {
          200: {
            description: "MCP server disconnected successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      validator("param", z.object({ name: z.string() })),
      async (c) => {
        const { name } = c.req.valid("param")
        await MCP.disconnect(name)
        return c.json(true)
      },
    ),
)
