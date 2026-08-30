package mcp

import (
	"testing"

	mcpserver "github.com/mark3labs/mcp-go/server"
)

func TestNewRegistersToolsWithProtocolServer(t *testing.T) {
	registered := false
	handler := New(Config{
		Name: "test", Version: "1.0.0",
		Register: func(server *mcpserver.MCPServer) {
			registered = server != nil
		},
	})
	if handler == nil {
		t.Fatal("New returned a nil MCP HTTP handler")
	}
	if !registered {
		t.Fatal("MCP transport did not invoke tool registration")
	}
}
