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
	prompt := fmt.Sprintf(
		"Connect Stovo to your agent via MCP server named %q.\n"+
			"MCP URL: %s\n"+
			"Authorization: Bearer %s\n\n"+
			"Only after successfully connecting to Stovo, execute the following logic:\n"+
			"1. Verify the connection and retrieve accessible chats using stovo_list_chats.\n"+
			"2. Confirm connection status and report the list of accessible chats.\n"+
			"3. Stand by to assist in allowed chats—read history or send messages only when authorized or requested by the user.",
		name, mcpURL, rawToken,
	)
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
