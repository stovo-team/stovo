package mcp

import (
	"context"

	protocol "github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/mark3labs/mcp-go/server"
)

// ToolHandlers are application use cases expressed at the MCP boundary. The
// transport owns names, schemas and descriptions; callers only provide the
// behavior behind those stable protocol contracts.
type ToolHandlers struct {
	ListChats       ListChats
	GetChatHistory  func(context.Context, protocol.CallToolRequest) (*protocol.CallToolResult, error)
	SearchMessages  func(context.Context, protocol.CallToolRequest) (*protocol.CallToolResult, error)
	SendMessage     func(context.Context, protocol.CallToolRequest) (*protocol.CallToolResult, error)
	EditMessage     func(context.Context, protocol.CallToolRequest) (*protocol.CallToolResult, error)
	DeleteMessage   func(context.Context, protocol.CallToolRequest) (*protocol.CallToolResult, error)
	AddReaction     func(context.Context, protocol.CallToolRequest) (*protocol.CallToolResult, error)
	RemoveReaction  func(context.Context, protocol.CallToolRequest) (*protocol.CallToolResult, error)
	ForwardMessage  func(context.Context, protocol.CallToolRequest) (*protocol.CallToolResult, error)
	PinMessage      func(context.Context, protocol.CallToolRequest) (*protocol.CallToolResult, error)
	UnpinMessage    func(context.Context, protocol.CallToolRequest) (*protocol.CallToolResult, error)
	ListChatFiles   func(context.Context, protocol.CallToolRequest) (*protocol.CallToolResult, error)
	GetDownloadLink func(context.Context, protocol.CallToolRequest) (*protocol.CallToolResult, error)
}

// RegisterTools registers all stable Stovo MCP tool schemas. Keeping this
// protocol mapping outside app prevents the compatibility host from owning
// mcp-go request definitions and result registration.
func RegisterTools(server *mcpserver.MCPServer, h ToolHandlers) {
	if h.ListChats != nil {
		RegisterListChats(server, h.ListChats)
	}
	add := func(tool protocol.Tool, handler func(context.Context, protocol.CallToolRequest) (*protocol.CallToolResult, error)) {
		if handler != nil {
			server.AddTool(tool, handler)
		}
	}
	add(protocol.NewTool("get_chat_history", protocol.WithDescription("Read recent messages from an allowed chat. History is capped by the connector's configured maximum history window."), protocol.WithString("chat_id", protocol.Required(), protocol.Description("Allowed chat ID")), protocol.WithNumber("limit", protocol.Description("Max messages to return (capped by connector policy)")), protocol.WithString("before_message_id", protocol.Description("Optional cursor: return messages older than this message ID"))), h.GetChatHistory)
	add(protocol.NewTool("search_messages", protocol.WithDescription("Search message text within allowed chats. Results are limited by connector history policy."), protocol.WithString("query", protocol.Required(), protocol.Description("Case-insensitive search text")), protocol.WithString("chat_id", protocol.Description("Optional allowed chat ID to restrict search")), protocol.WithNumber("limit", protocol.Description("Max matches to return"))), h.SearchMessages)
	add(protocol.NewTool("send_message", protocol.WithDescription("Send a new text message to an allowed chat. Requires messages.send permission."), protocol.WithString("chat_id", protocol.Required(), protocol.Description("Allowed chat ID")), protocol.WithString("content", protocol.Required(), protocol.Description("Message text (max 4000 characters)")), protocol.WithString("reply_to_message_id", protocol.Description("Optional message ID to reply to"))), h.SendMessage)
	add(protocol.NewTool("edit_message", protocol.WithDescription("Edit a message previously sent by this connector. Requires messages.edit permission. Destructive relative to chat history."), protocol.WithString("message_id", protocol.Required(), protocol.Description("Message ID sent by this connector")), protocol.WithString("content", protocol.Required(), protocol.Description("Updated message text"))), h.EditMessage)
	add(protocol.NewTool("delete_message", protocol.WithDescription("Permanently soft-delete a message previously sent by this connector for everyone. Requires messages.delete permission. This is a destructive action."), protocol.WithString("message_id", protocol.Required(), protocol.Description("Message ID sent by this connector"))), h.DeleteMessage)
	add(protocol.NewTool("add_reaction", protocol.WithDescription("Add an emoji reaction to a message in an allowed chat. Requires messages.react permission."), protocol.WithString("message_id", protocol.Required(), protocol.Description("Message ID")), protocol.WithString("emoji", protocol.Required(), protocol.Description("Emoji reaction"))), h.AddReaction)
	add(protocol.NewTool("remove_reaction", protocol.WithDescription("Remove this connector's emoji reaction from a message. Requires messages.react permission."), protocol.WithString("message_id", protocol.Required(), protocol.Description("Message ID")), protocol.WithString("emoji", protocol.Required(), protocol.Description("Emoji reaction to remove"))), h.RemoveReaction)
	add(protocol.NewTool("forward_message", protocol.WithDescription("Forward a message into another allowed chat. Requires messages.forward permission. Both source and target chats must be allowed."), protocol.WithString("message_id", protocol.Required(), protocol.Description("Source message ID")), protocol.WithString("target_chat_id", protocol.Required(), protocol.Description("Allowed destination chat ID"))), h.ForwardMessage)
	add(protocol.NewTool("pin_message", protocol.WithDescription("Pin a message in an allowed chat. Requires messages.pin permission."), protocol.WithString("chat_id", protocol.Required(), protocol.Description("Allowed chat ID")), protocol.WithString("message_id", protocol.Required(), protocol.Description("Message ID in that chat"))), h.PinMessage)
	add(protocol.NewTool("unpin_message", protocol.WithDescription("Unpin a message in an allowed chat. Requires messages.unpin permission."), protocol.WithString("chat_id", protocol.Required(), protocol.Description("Allowed chat ID")), protocol.WithString("message_id", protocol.Required(), protocol.Description("Pinned message ID"))), h.UnpinMessage)
	add(protocol.NewTool("list_chat_files", protocol.WithDescription("List file metadata attached to an allowed chat. Requires files.list permission."), protocol.WithString("chat_id", protocol.Required(), protocol.Description("Allowed chat ID")), protocol.WithNumber("limit", protocol.Description("Max files to return"))), h.ListChatFiles)
	add(protocol.NewTool("get_file_download_link", protocol.WithDescription("Create a time-limited authorized download URL for a file visible in an allowed chat. Requires files.download permission. Treat as sensitive."), protocol.WithString("file_id", protocol.Required(), protocol.Description("File ID"))), h.GetDownloadLink)
}
