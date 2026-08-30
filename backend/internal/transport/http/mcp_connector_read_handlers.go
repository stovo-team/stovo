package http

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// MCPConnectorReadOperations keeps connector lookup and authorization in the
// composed application while this transport owns the HTTP contract.
type MCPConnectorReadOperations struct {
	IsAdmin func() bool
	List    func(context.Context) (any, error)
	Get     func(context.Context, string) (any, error)
}

type MCPConnectorReadHandler struct{ operations MCPConnectorReadOperations }

func NewMCPConnectorReadHandler(operations MCPConnectorReadOperations) MCPConnectorReadHandler {
	return MCPConnectorReadHandler{operations}
}

func (h MCPConnectorReadHandler) List(w http.ResponseWriter, r *http.Request) {
	if h.operations.IsAdmin == nil || !h.operations.IsAdmin() {
		writeFamilyReadJSON(w, http.StatusForbidden, map[string]string{"detail": "Admin access required"})
		return
	}
	connectors, err := h.operations.List(r.Context())
	if err != nil {
		writeFamilyReadJSON(w, http.StatusInternalServerError, map[string]string{"detail": "Could not load MCP connectors"})
		return
	}
	writeFamilyReadJSON(w, http.StatusOK, connectors)
}
func (h MCPConnectorReadHandler) Get(w http.ResponseWriter, r *http.Request) {
	if h.operations.IsAdmin == nil || !h.operations.IsAdmin() {
		writeFamilyReadJSON(w, http.StatusForbidden, map[string]string{"detail": "Admin access required"})
		return
	}
	connector, err := h.operations.Get(r.Context(), chi.URLParam(r, "connectorId"))
	if err != nil {
		writeFamilyReadJSON(w, http.StatusNotFound, map[string]string{"detail": "Connector not found"})
		return
	}
	writeFamilyReadJSON(w, http.StatusOK, connector)
}
