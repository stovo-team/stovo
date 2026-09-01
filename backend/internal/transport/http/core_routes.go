package http

import (
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

// CoreRoutes contains the already-composed inbound handlers for the service
// metadata, readiness, and synchronization endpoints. Sync must be wrapped by
// the caller so authentication remains a transport-edge concern.
type CoreRoutes struct {
	AssetLinks  stdhttp.Handler
	Health      stdhttp.Handler
	HealthDB    stdhttp.Handler
	HealthRedis stdhttp.Handler
	Sync        stdhttp.Handler
	Manifest    stdhttp.Handler
}

// RegisterCoreRoutes installs the stable public routes that do not belong to
// a product feature. It deliberately owns only methods and paths; callers own
// handler construction and authentication composition.
func RegisterCoreRoutes(router chi.Router, routes CoreRoutes) {
	router.Get("/.well-known/assetlinks.json", routes.AssetLinks.ServeHTTP)
	router.Get("/api/health", routes.Health.ServeHTTP)
	router.Get("/api/health/db", routes.HealthDB.ServeHTTP)
	router.Get("/api/health/redis", routes.HealthRedis.ServeHTTP)
	router.Get("/api/sync", routes.Sync.ServeHTTP)
	if routes.Manifest != nil {
		router.Get("/api/v1/config/manifest", routes.Manifest.ServeHTTP)
	}
}
