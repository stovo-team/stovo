package http

import (
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

// RegisterSocketRoutes installs the Socket.IO HTTP handshake and polling
// endpoints. Socket.IO itself remains an inbound transport implementation;
// callers supply its handler so this package never depends on a particular
// Socket.IO library or application runtime.
func RegisterSocketRoutes(router chi.Router, handler stdhttp.Handler) {
	router.Method(stdhttp.MethodGet, "/socket.io/", handler)
	router.Method(stdhttp.MethodPost, "/socket.io/", handler)
	router.Method(stdhttp.MethodGet, "/socket.io/*", handler)
	router.Method(stdhttp.MethodPost, "/socket.io/*", handler)
}
