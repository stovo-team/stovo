// orchestrator/orchestrator.go
package orchestrator

import (
	"database/sql"
	"log"

	"github.com/docker/docker/client"
	"github.com/go-chi/chi/v5"
	_ "github.com/jackc/pgx/v5/stdlib"
)

type Orchestrator struct {
	dockerClient *client.Client
	masterDB     *sql.DB
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
	orch := &Orchestrator{dockerClient: dockerClient, masterDB: db}
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
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);
	CREATE INDEX IF NOT EXISTS idx_servers_slug ON servers(slug);
	ALTER TABLE servers ADD COLUMN IF NOT EXISTS nav_tabs JSONB DEFAULT '{"chats":true,"storage":true,"plans":true,"settings":true}'::jsonb;
	`
	_, err := o.masterDB.Exec(schema)
	return err
}

// ReconcileContainers ensures all registered servers have active running backend containers.
func (o *Orchestrator) ReconcileContainers() {
	rows, err := o.masterDB.Query(`SELECT slug FROM servers`)
	if err != nil {
		log.Printf("[orchestrator] Reconcile query error: %v", err)
		return
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var slug string
		if err := rows.Scan(&slug); err == nil && slug != "" {
			if err := o.startBackendContainer(slug); err != nil {
				log.Printf("[orchestrator] failed to reconcile server %s: %v", slug, err)
			}
		}
	}
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
	r.Post("/api/v1/master/auth/login", o.handleLogin)
	r.Get("/api/v1/master/resolve", o.handleResolve)

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
