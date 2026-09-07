// Package mcp is the inbound MCP transport. It owns the mcp-go server
// configuration while callers retain ownership of tool use cases and auth.
package mcp

import (
	"context"
	"net/http"

	mcpserver "github.com/mark3labs/mcp-go/server"
)

// Config contains only protocol configuration and callbacks. In particular,
// the transport deliberately does not know about connector persistence or
// application feature services.
type Config struct {
	Name          string
	Version       string
	Endpoint      string
	Register      func(*mcpserver.MCPServer)
	BridgeContext func(context.Context) context.Context
}

// New creates the Streamable HTTP MCP endpoint with Stovo's established
// protocol settings. Tool registration is supplied by the composition caller.
func New(config Config) http.Handler {
	server := mcpserver.NewMCPServer(
		config.Name,
		config.Version,
		mcpserver.WithToolCapabilities(true),
	)
	if config.Register != nil {
		config.Register(server)
	}
	endpoint := config.Endpoint
	if endpoint == "" {
		endpoint = "/mcp"
	}
	return mcpserver.NewStreamableHTTPServer(
		server,
		mcpserver.WithEndpointPath(endpoint),
		mcpserver.WithDisableLocalhostProtection(true),
		mcpserver.WithStateLess(true),
		mcpserver.WithHTTPContextFunc(func(ctx context.Context, _ *http.Request) context.Context {
			if config.BridgeContext != nil {
				return config.BridgeContext(ctx)
			}
			return ctx
		}),
	)
}
