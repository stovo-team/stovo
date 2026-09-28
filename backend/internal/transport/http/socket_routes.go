package http

import (
	stdhttp "net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

// NormalizeWebSocketUpgrade adapts valid comma-separated Connection headers for
// Socket.IO handlers that expect the Upgrade token as the entire header value.
func NormalizeWebSocketUpgrade(next stdhttp.Handler) stdhttp.Handler {
	return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		if strings.EqualFold(strings.TrimSpace(r.Header.Get("Upgrade")), "websocket") {
			for _, token := range strings.Split(r.Header.Get("Connection"), ",") {
				if strings.EqualFold(strings.TrimSpace(token), "upgrade") {
					request := r.Clone(r.Context())
					request.Header = r.Header.Clone()
					request.Header.Set("Connection", "Upgrade")
					request.Header.Set("Upgrade", "websocket")
					next.ServeHTTP(w, request)
					return
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

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
