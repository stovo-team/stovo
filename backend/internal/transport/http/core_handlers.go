package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"
)

// CoreHandlerDependencies are the outer services needed by the small service
// metadata/readiness endpoints. Keeping them here prevents the compatibility
// host from owning HTTP response construction.
type CoreHandlerDependencies struct {
	AppName        string
	Environment    string
	Version        string
	DatabaseHealth func(context.Context) error
	RedisHealth    func(context.Context) error
}

type CoreHandlers struct{ dependencies CoreHandlerDependencies }

func NewCoreHandlers(dependencies CoreHandlerDependencies) CoreHandlers {
	return CoreHandlers{dependencies: dependencies}
}

func (h CoreHandlers) Health(w stdhttp.ResponseWriter, _ *stdhttp.Request) {
	writeCoreJSON(w, stdhttp.StatusOK, map[string]string{"status": "ok", "service": h.dependencies.AppName, "environment": h.dependencies.Environment, "version": h.dependencies.Version})
}

func (h CoreHandlers) HealthDB(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	if h.dependencies.DatabaseHealth == nil || h.dependencies.DatabaseHealth(r.Context()) != nil {
		writeCoreDetail(w, stdhttp.StatusServiceUnavailable, "PostgreSQL health check failed")
		return
	}
	writeCoreJSON(w, stdhttp.StatusOK, map[string]string{"status": "ok", "service": "postgres"})
}

func (h CoreHandlers) HealthRedis(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	if h.dependencies.RedisHealth == nil || h.dependencies.RedisHealth(context.Background()) != nil {
		writeCoreDetail(w, stdhttp.StatusServiceUnavailable, "Redis health check failed")
		return
	}
	writeCoreJSON(w, stdhttp.StatusOK, map[string]string{"status": "ok", "service": "redis"})
}

func (h CoreHandlers) AssetLinks(w stdhttp.ResponseWriter, _ *stdhttp.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(stdhttp.StatusOK)
	_, _ = w.Write([]byte(`[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.stakhovivan.stovo",
      "sha256_cert_fingerprints": [
        "18:7C:F4:A5:68:55:01:A0:87:C7:E4:09:59:B3:36:9C:2C:19:D9:D2:C3:00:87:72:08:92:44:81:40:91:37:F9"
      ]
    }
  }
]`))
}

func writeCoreJSON(w stdhttp.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeCoreDetail(w stdhttp.ResponseWriter, status int, detail string) {
	writeCoreJSON(w, status, map[string]string{"detail": detail})
}
