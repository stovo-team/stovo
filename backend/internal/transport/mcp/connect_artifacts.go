package mcp

import (
	"fmt"
	"strings"
)

// ConnectArtifacts is the protocol-facing setup material returned when a
// connector credential is created or rotated. It belongs to the MCP transport:
// it contains neither persistence models nor application policy.
type ConnectArtifacts struct {
	URL         string
	CLICommand  string
	SetupPrompt string
}

// URLForServer constructs the stable MCP HTTP endpoint for a public base URL.
func URLForServer(baseURL, serverID string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if serverID = strings.TrimSpace(serverID); serverID != "" && !strings.Contains(baseURL, "/s/") {
		baseURL += "/s/" + serverID
	}
	return baseURL + "/mcp"
}

// BuildConnectArtifacts serializes client-specific MCP setup instructions.
func BuildConnectArtifacts(mcpURL, provider, authMode, alias, connectorName, rawToken string) ConnectArtifacts {
	name := strings.TrimSpace(connectorName)
	if name == "" {
		name = "stovo"
	}
	provider = strings.TrimSpace(strings.ToLower(provider))
	if alias == "" {
		alias = defaultAlias(provider)
	}
	if authMode == "" {
		authMode = "subscription"
	}
	safeName := strings.ReplaceAll(strings.ToLower(name), " ", "-")
	if safeName == "" {
		safeName = "stovo"
	}
	var command string
	switch provider {
	case "codex":
		command = fmt.Sprintf(`codex mcp add %s --url %s --header "Authorization: Bearer %s"`, safeName, mcpURL, rawToken)
	case "openclaw", "hermes":
		command = fmt.Sprintf("# Add HTTP MCP server %q\n# URL: %s\n# Header: Authorization: Bearer %s", name, mcpURL, rawToken)
	default:
		command = fmt.Sprintf(`claude mcp add --transport http --scope user %s %s --header "Authorization: Bearer %s"`, safeName, mcpURL, rawToken)
	}
	authHint := "Use your existing app subscription for this agent (no Stovo-stored API key)."
	if authMode == "api" {
		authHint = "Configure this agent in API mode with your provider API key in the client app (Stovo still only stores the MCP bearer token)."
	}
	mention := "@" + alias
	var prompt string
	switch provider {
	case "codex":
		prompt = fmt.Sprintf("Add an HTTP MCP server in ChatGPT / Codex settings named %q (mention alias %s). Use URL %s and set the Authorization header to Bearer %s. %s Save and enable it for this workspace.", name, mention, mcpURL, rawToken, authHint)
	case "openclaw":
		prompt = fmt.Sprintf("In OpenClaw, add a custom HTTP MCP connector named %q (mention alias %s). MCP URL: %s. Authorization: Bearer %s. %s Enable the connector after saving.", name, mention, mcpURL, rawToken, authHint)
	case "hermes":
		prompt = fmt.Sprintf("In Hermes, open Connectors / MCP and add a custom HTTP server named %q (mention alias %s). URL: %s. Header Authorization: Bearer %s. %s Save and turn it on.", name, mention, mcpURL, rawToken, authHint)
	default:
		prompt = fmt.Sprintf("In Claude Code, open Settings → MCP and add a custom HTTP connector named %q (mention alias %s). Paste URL %s and set Authorization to Bearer %s. %s Save and enable it for this project.", name, mention, mcpURL, rawToken, authHint)
	}
	return ConnectArtifacts{URL: mcpURL, CLICommand: command, SetupPrompt: prompt}
}

func defaultAlias(provider string) string {
	switch provider {
	case "codex":
		return "codex"
	case "openclaw":
		return "openclaw"
	case "hermes":
		return "hermes"
	default:
		return "claude"
	}
}
