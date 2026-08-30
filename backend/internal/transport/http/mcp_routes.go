package http

import (
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

// RegisterMCPRoutes installs the streamable MCP HTTP endpoint. Callers supply
// the fully composed handler (including connector authentication), keeping
// this transport package independent of the MCP server implementation and
// application policy.
func RegisterMCPRoutes(router chi.Router, handler stdhttp.Handler) {
	if handler == nil {
		return
	}
	router.Handle("/mcp", handler)
	router.Handle("/mcp/", handler)
}
