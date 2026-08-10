package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"family-messenger/backend/internal/orchestrator"
	"github.com/docker/docker/client"
	"github.com/go-chi/chi/v5"
)

func main() {
	// Initialize Docker client (uses /var/run/docker.sock mounted into the container)
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Fatalf("Docker client init error: %v", err)
	}

	// Master DB connection string – required for server registry and admin credentials
	masterDBURL := os.Getenv("MASTER_DB_URL")
	if masterDBURL == "" {
		log.Fatal("MASTER_DB_URL environment variable not set")
	}

	// Initialise the orchestrator service (holds the Docker client and DB handle)
	orch := orchestrator.NewOrchestrator(cli, masterDBURL)

	// Setup HTTP router for master API (port 8001)
	r := chi.NewRouter()
	orch.RegisterRoutes(r)

	srv := &http.Server{Addr: ":8001", Handler: r}
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Orchestrator server error: %v", err)
		}
	}()
	log.Println("Orchestrator listening on :8001")

	// Graceful shutdown handling (placeholder – you can hook OS signals here)
	quit := make(chan os.Signal, 1)
	<-quit
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}
