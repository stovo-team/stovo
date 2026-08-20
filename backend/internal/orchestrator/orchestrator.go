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
	orch.ReconcileContainers()
	return orch
}

// ReconcileContainers ensures all registered servers have active running backend containers.
func (o *Orchestrator) ReconcileContainers() {
	rows, err := o.masterDB.Query(`SELECT slug FROM servers`)
	if err != nil {
		log.Printf("[orchestrator] Reconcile query error: %v", err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var slug string
		if err := rows.Scan(&slug); err == nil && slug != "" {
			_ = o.startBackendContainer(slug)
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
	// Note: chi is imported in routes.go – we keep a thin wrapper here.
	r.Post("/api/v1/master/servers", o.handleCreateServer)
	r.Get("/api/v1/master/servers", o.handleListServers)
	r.Get("/api/v1/master/servers/{id}/settings", o.handleGetServerSettings)
	r.Patch("/api/v1/master/servers/{id}/settings", o.handleUpdateServerSettings)
	r.Put("/api/v1/master/servers/{id}/settings", o.handleUpdateServerSettings)
	r.Delete("/api/v1/master/servers/{id}", o.handleDeleteServer)
	r.Post("/api/v1/master/servers/{id}/ghost-token", o.handleGhostToken)
	r.Post("/api/v1/master/servers/{id}/invite", o.handleCreateInviteToken)
	r.Get("/api/v1/master/resolve", o.handleResolve)
	r.Post("/api/v1/master/auth/login", o.handleLogin)
}

// The handler implementations live in routes.go.
