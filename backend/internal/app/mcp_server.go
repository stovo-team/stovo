package app

import (
	"context"
	"net/http"

	"github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/mark3labs/mcp-go/server"
)

func (s *Server) initMCP() {
	mcpSrv := mcpserver.NewMCPServer(
		"stovo",
		s.cfg.AppVersion,
		mcpserver.WithToolCapabilities(true),
	)
	s.registerMCPTools(mcpSrv)
	s.mcpHTTP = mcpserver.NewStreamableHTTPServer(
		mcpSrv,
		mcpserver.WithEndpointPath("/mcp"),
		mcpserver.WithDisableLocalhostProtection(true),
		mcpserver.WithHTTPContextFunc(func(ctx context.Context, r *http.Request) context.Context {
			if connector, ok := mcpConnectorFromContext(ctx); ok {
				return context.WithValue(ctx, mcpConnectorContextKey{}, connector)
			}
			return ctx
		}),
	)
}

func (s *Server) mcpAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		connector, err := s.resolveMCPConnectorFromRequest(r)
		if err != nil {
			s.detail(w, http.StatusUnauthorized, "Invalid or missing connector token")
			return
		}
		ctx := context.WithValue(r.Context(), mcpConnectorContextKey{}, connector)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) mcpToolJSON(v any) (*mcp.CallToolResult, error) {
	result, err := mcp.NewToolResultJSON(v)
	if err != nil {
		return mcp.NewToolResultError("failed to encode tool result"), nil
	}
	return result, nil
}

func (s *Server) mcpToolError(message string) (*mcp.CallToolResult, error) {
	return mcp.NewToolResultError(message), nil
}

func (s *Server) mcpActor(connector mcpConnectorRecord) (userPublic, error) {
	user, err := s.getUserByID(connector.ActorUserID)
	if err != nil {
		return userPublic{}, err
	}
	// Actor users are intentionally inactive for login; allow tool execution anyway.
	user.IsActive = true
	return user, nil
}
