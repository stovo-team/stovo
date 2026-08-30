package mcp

import (
	"context"

	protocol "github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/mark3labs/mcp-go/server"
)

// ChatSummary is the protocol-facing representation returned by list_chats.
// Keeping it at the inbound edge prevents application DTOs from leaking into
// the MCP contract.
type ChatSummary struct {
	ID    string `json:"id"`
	Type  string `json:"type"`
	Title string `json:"title"`
}

// ListChats loads the connector-authorized chat summaries. Implementations
// retain authorization and audit policy; this transport owns MCP registration
// and result serialization.
type ListChats func(context.Context) ([]ChatSummary, error)

// RegisterListChats registers Stovo's stable list_chats MCP tool contract.
func RegisterListChats(server *mcpserver.MCPServer, list ListChats) {
	server.AddTool(protocol.NewTool("list_chats",
		protocol.WithDescription("List chats this Stovo connector is allowed to access. Does not return chats outside the connector policy."),
	), func(ctx context.Context, _ protocol.CallToolRequest) (*protocol.CallToolResult, error) {
		chats, err := list(ctx)
		if err != nil {
			return protocol.NewToolResultError(err.Error()), nil
		}
		result, err := protocol.NewToolResultJSON(map[string]any{"chats": chats})
		if err != nil {
			return protocol.NewToolResultError("failed to encode tool result"), nil
		}
		return result, nil
	})
}
