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
	prompt := fmt.Sprintf(
		"Connect Stovo to your agent via MCP server named %q.\n"+
			"MCP URL: %s\n"+
			"Authorization: Bearer %s\n\n"+
			"This URL is bound to one Stovo Space; do not use it for another Space.\n\n"+
			"After successfully connecting to Stovo:\n"+
			"1. Call stovo_connection_status. If it reports a configuration issue, show its nextAction instead of claiming there are no chats.\n"+
			"2. If ready, call stovo_list_chats and report the accessible chats.\n"+
			"3. Work only in those chats—read history or send messages only when authorized or requested by the user.",
		name, mcpURL, rawToken,
	)
	return ConnectArtifacts{URL: mcpURL, CLICommand: command, SetupPrompt: prompt}
}
