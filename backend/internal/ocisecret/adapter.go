package ocisecret

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// SecretReader reads secret version key-values from OCI Secrets in Vault.
type SecretReader interface {
	ReadVersion(ctx context.Context, version int64) (map[string]string, error)
}

// Config configures the Adapter.
type Config struct {
	Reader        SecretReader
	SecretOCID    string
	AllowlistKeys []string
	AuthToken     string
	Timeout       time.Duration
}

// Adapter provides private HTTP secret lookup for Doco-CD webhook provider.
type Adapter struct {
	cfg       Config
	allowlist map[string]bool
	cacheMu   sync.RWMutex
	cache     map[int64]map[string]string
}

// NewAdapter creates an Adapter instance.
func NewAdapter(cfg Config) *Adapter {
	if cfg.Timeout == 0 {
		cfg.Timeout = 5 * time.Second
	}
	al := make(map[string]bool, len(cfg.AllowlistKeys))
	for _, k := range cfg.AllowlistKeys {
		al[k] = true
	}
	return &Adapter{
		cfg:       cfg,
		allowlist: al,
		cache:     make(map[int64]map[string]string),
	}
}

// Handler returns the HTTP handler exposing GET /v1/secrets/{version}/{key}.
func (a *Adapter) Handler() http.Handler {
	r := chi.NewRouter()

	r.Get("/v1/secrets/{version}/{key}", a.handleGetSecret)
	return r
}

func (a *Adapter) handleGetSecret(w http.ResponseWriter, r *http.Request) {
	// 1. Authenticate bearer token if configured
	if a.cfg.AuthToken != "" {
		auth := r.Header.Get("Authorization")
		expected := "Bearer " + a.cfg.AuthToken
		if auth != expected {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
	}

	// 2. Validate version param: positive integer
	versionStr := chi.URLParam(r, "version")
	version, err := strconv.ParseInt(versionStr, 10, 64)
	if err != nil || version <= 0 {
		http.Error(w, `{"error":"invalid secret version: must be a positive integer"}`, http.StatusBadRequest)
		return
	}

	// 3. Validate key against allowlist
	key := chi.URLParam(r, "key")
	if len(a.allowlist) > 0 && !a.allowlist[key] {
		http.Error(w, fmt.Sprintf(`{"error":"key %q is not allowlisted"}`, key), http.StatusForbidden)
		return
	}

	// 4. Resolve secret version
	values, err := a.resolveVersion(r.Context(), version)
	if err != nil {
		log.Printf("[ocisecret] failed to read secret version %d: %v", version, err)
		http.Error(w, `{"error":"failed to retrieve secret version from upstream"}`, http.StatusBadGateway)
		return
	}

	val, ok := values[key]
	if !ok {
		http.Error(w, fmt.Sprintf(`{"error":"key %q not found in secret version"}`, key), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"value": val,
	})
}

func (a *Adapter) resolveVersion(ctx context.Context, version int64) (map[string]string, error) {
	a.cacheMu.RLock()
	cached, ok := a.cache[version]
	a.cacheMu.RUnlock()
	if ok {
		return cached, nil
	}

	ctx, cancel := context.WithTimeout(ctx, a.cfg.Timeout)
	defer cancel()

	values, err := a.cfg.Reader.ReadVersion(ctx, version)
	if err != nil {
		return nil, err
	}

	a.cacheMu.Lock()
	a.cache[version] = values
	a.cacheMu.Unlock()

	return values, nil
}
