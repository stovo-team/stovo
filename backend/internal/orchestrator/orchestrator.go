// orchestrator/orchestrator.go
package orchestrator

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/docker/docker/client"
	"github.com/go-chi/chi/v5"
	_ "github.com/jackc/pgx/v5/stdlib"
)

type TenantRolloutStatus struct {
	Slug   string `json:"slug"`
	Status string `json:"status"`
	Image  string `json:"image,omitempty"`
	Error  string `json:"error,omitempty"`
}

type RolloutStatus struct {
	ReleaseID    string                         `json:"release_id"`
	DesiredImage string                         `json:"desired_image"`
	Phase        string                         `json:"phase"`
	Completed    bool                           `json:"completed"`
	Tenants      map[string]TenantRolloutStatus `json:"tenants"`
}

type Orchestrator struct {
	dockerClient  *client.Client
	masterDB      *sql.DB
	rolloutMu     sync.RWMutex
	rolloutStatus RolloutStatus
}

func getTenantBackendImage() string {
	if img := strings.TrimSpace(os.Getenv("TENANT_BACKEND_IMAGE")); img != "" {
		return img
	}
	return "stovo-backend:latest"
}

func getReleaseID() string {
	if id := strings.TrimSpace(os.Getenv("RELEASE_ID")); id != "" {
		return id
	}
	return "development"
}

// NewOrchestrator creates a new Orchestrator instance. masterDBURL should be a PostgreSQL connection string.
func NewOrchestrator(dockerClient *client.Client, masterDBURL string) *Orchestrator {
	db, err := sql.Open("pgx", masterDBURL)
	if err != nil {
		log.Fatalf("failed to connect to master DB: %v", err)
	}
	// Ensure DB reachable
	if err := db.Ping(); err != nil {
		log.Fatalf("cannot ping master DB: %v", err)
	}
	orch := &Orchestrator{
		dockerClient: dockerClient,
		masterDB:     db,
		rolloutStatus: RolloutStatus{
			ReleaseID:    getReleaseID(),
			DesiredImage: getTenantBackendImage(),
			Phase:        "reconciling",
			Completed:    false,
			Tenants:      make(map[string]TenantRolloutStatus),
		},
	}
	if err := orch.initSchema(); err != nil {
		log.Printf("[orchestrator] failed to init master DB schema: %v", err)
	}
	orch.ReconcileContainers()
	return orch
}

// initSchema creates the master servers table if it does not already exist.
func (o *Orchestrator) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS servers (
		id SERIAL PRIMARY KEY,
		slug VARCHAR(64) NOT NULL UNIQUE,
		name VARCHAR(255) NOT NULL,
		status VARCHAR(64) NOT NULL DEFAULT 'running',
		nav_tabs JSONB,
		chat_types JSONB NOT NULL DEFAULT '{"direct":true,"group":true,"channel":true,"voice":true}'::jsonb,
		require_setup_invite BOOLEAN NOT NULL DEFAULT FALSE,
		public_preview BOOLEAN NOT NULL DEFAULT FALSE,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);
	CREATE INDEX IF NOT EXISTS idx_servers_slug ON servers(slug);
	ALTER TABLE servers ADD COLUMN IF NOT EXISTS nav_tabs JSONB DEFAULT '{"chats":true,"storage":true,"plans":true,"settings":true}'::jsonb;
	ALTER TABLE servers ADD COLUMN IF NOT EXISTS chat_types JSONB NOT NULL DEFAULT '{"direct":true,"group":true,"channel":true,"voice":true}'::jsonb;
	ALTER TABLE servers ADD COLUMN IF NOT EXISTS require_setup_invite BOOLEAN NOT NULL DEFAULT FALSE;
	ALTER TABLE servers ADD COLUMN IF NOT EXISTS public_preview BOOLEAN NOT NULL DEFAULT FALSE;
	`
	_, err := o.masterDB.Exec(schema)
	return err
}

// ReconcileContainers ensures all registered servers have active running backend containers.
func (o *Orchestrator) ReconcileContainers() {
	desiredImage := getTenantBackendImage()
	releaseID := getReleaseID()

	o.rolloutMu.Lock()
	o.rolloutStatus.ReleaseID = releaseID
	o.rolloutStatus.DesiredImage = desiredImage
	o.rolloutStatus.Phase = "reconciling"
	o.rolloutStatus.Completed = false
	if o.rolloutStatus.Tenants == nil {
		o.rolloutStatus.Tenants = make(map[string]TenantRolloutStatus)
	}
	o.rolloutMu.Unlock()

	rows, err := o.masterDB.Query(`SELECT slug FROM servers`)
	if err != nil {
		log.Printf("[orchestrator] Reconcile query error: %v", err)
		o.rolloutMu.Lock()
		o.rolloutStatus.Phase = "failed"
		o.rolloutStatus.Completed = false
		o.rolloutMu.Unlock()
		return
	}
	defer func() { _ = rows.Close() }()

	hasFailures := false
	for rows.Next() {
		var slug string
		if err := rows.Scan(&slug); err == nil && slug != "" {
			err := o.startBackendContainer(slug)
			o.rolloutMu.Lock()
			if err != nil {
				hasFailures = true
				o.rolloutStatus.Tenants[slug] = TenantRolloutStatus{
					Slug:   slug,
					Status: "failed",
					Image:  desiredImage,
					Error:  err.Error(),
				}
				log.Printf("[orchestrator] failed to reconcile server %s: %v", slug, err)
			} else {
				o.rolloutStatus.Tenants[slug] = TenantRolloutStatus{
					Slug:   slug,
					Status: "running",
					Image:  desiredImage,
				}
			}
			o.rolloutMu.Unlock()
		}
	}

	o.rolloutMu.Lock()
	if hasFailures {
		o.rolloutStatus.Phase = "failed"
		o.rolloutStatus.Completed = false
	} else {
		o.rolloutStatus.Phase = "ready"
		o.rolloutStatus.Completed = true
	}
	o.rolloutMu.Unlock()
}

func (o *Orchestrator) handleRolloutStatus(w http.ResponseWriter, r *http.Request) {
	o.rolloutMu.RLock()
	status := o.rolloutStatus
	tenantsCopy := make(map[string]TenantRolloutStatus, len(status.Tenants))
	for k, v := range status.Tenants {
		tenantsCopy[k] = v
	}
	status.Tenants = tenantsCopy
	o.rolloutMu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	if !status.Completed && status.Phase == "failed" {
		w.WriteHeader(http.StatusServiceUnavailable)
	} else if !status.Completed {
		w.WriteHeader(http.StatusAccepted)
	} else {
		w.WriteHeader(http.StatusOK)
	}
	_ = json.NewEncoder(w).Encode(status)
}

// Close releases resources.
func (o *Orchestrator) Close() error {
	if o.masterDB != nil {
		_ = o.masterDB.Close()
	}
	return nil
}

// RegisterRoutes attaches HTTP handlers for the master API.
func (o *Orchestrator) RegisterRoutes(r chi.Router) {
	r.Get("/internal/gitops/rollout", o.handleRolloutStatus)
	r.Post("/api/v1/master/auth/login", o.handleLogin)
	r.Get("/api/v1/master/resolve", o.handleResolve)
	r.Get("/preview/{slug}", o.handleSpacePreview)
	r.Get("/preview/{slug}/og.png", o.handleSpacePreviewImage)

	r.Group(func(protected chi.Router) {
		protected.Use(o.masterAuth)
		protected.Post("/api/v1/master/servers", o.handleCreateServer)
		protected.Get("/api/v1/master/servers", o.handleListServers)
		protected.Get("/api/v1/master/servers/{id}/settings", o.handleGetServerSettings)
		protected.Patch("/api/v1/master/servers/{id}/settings", o.handleUpdateServerSettings)
		protected.Put("/api/v1/master/servers/{id}/settings", o.handleUpdateServerSettings)
		protected.Delete("/api/v1/master/servers/{id}", o.handleDeleteServer)
		protected.Post("/api/v1/master/servers/{id}/ghost-token", o.handleGhostToken)
		protected.Post("/api/v1/master/servers/{id}/invite", o.handleCreateInviteToken)
	})
}

// The handler implementations live in routes.go.
