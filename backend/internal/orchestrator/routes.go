// orchestrator/routes.go
package orchestrator

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"family-messenger/backend/internal/config"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type ServerRecord struct {
	ID        int       `json:"id"`
	Slug      string    `json:"slug"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	Status    string    `json:"status"`
}

// Helper to write JSON response
func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

// handleLogin authenticates the master admin and returns a JWT for the orchestrator API.
func (o *Orchestrator) handleLogin(w http.ResponseWriter, r *http.Request) {
	type loginReq struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	adminUser := os.Getenv("MASTER_ADMIN_USER")
	adminPass := os.Getenv("MASTER_ADMIN_PASSWORD")
	if req.Username != adminUser || req.Password != adminPass {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
		return
	}
	secret := []byte(os.Getenv("MASTER_SYSTEM_SECRET"))
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":   "master_admin",
		"admin": true,
		"exp":   time.Now().Add(24 * time.Hour).Unix(),
	})
	signed, _ := token.SignedString(secret)
	writeJSON(w, http.StatusOK, map[string]string{"access_token": signed})
}

// middleware to protect master routes (simple check of JWT in Authorization header)
func (o *Orchestrator) masterAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if len(auth) < 7 || auth[:7] != "Bearer " {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing token"})
			return
		}
		tokenStr := auth[7:]
		secret := []byte(os.Getenv("MASTER_SYSTEM_SECRET"))
		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			return secret, nil
		})
		if err != nil || !token.Valid {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid token"})
			return
		}
		// optionally check admin claim
		next.ServeHTTP(w, r)
	})
}

// handleCreateServer provisions a new child server and auto-provisions its admin user.
func (o *Orchestrator) handleCreateServer(w http.ResponseWriter, r *http.Request) {
	type createReq struct {
		Slug          string `json:"slug"`
		Name          string `json:"name"`
		AdminUser     string `json:"admin_user"`
		AdminPassword string `json:"admin_password"`
	}
	var req createReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid payload"})
		return
	}
	// Always auto-generate a random 8-character hash slug
	req.Slug = strings.ReplaceAll(uuid.NewString(), "-", "")[:8]

	if req.AdminUser == "" {
		req.AdminUser = "admin"
	}
	if req.AdminPassword == "" {
		req.AdminPassword = "admin" + uuid.NewString()[:8]
	}

	// Insert server record
	var id int
	err := o.masterDB.QueryRow(`INSERT INTO servers (slug, name, status) VALUES ($1, $2, $3) RETURNING id`, req.Slug, req.Name, "created").Scan(&id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	// Create PostgreSQL schema for the server
	dbName := "stovo_db_" + req.Slug
	_, _ = o.masterDB.Exec(`CREATE DATABASE ` + dbName)

	// Create MinIO bucket
	minioEndpoint := os.Getenv("MINIO_ENDPOINT")
	minioAccessKey := os.Getenv("MINIO_ACCESS_KEY")
	minioSecretKey := os.Getenv("MINIO_SECRET_KEY")
	mc, err := minio.New(minioEndpoint, &minio.Options{Creds: credentials.NewStaticV4(minioAccessKey, minioSecretKey, ""), Secure: false})
	if err == nil {
		bucketName := fmt.Sprintf("stovo-%s", req.Slug)
		ctx := context.Background()
		_ = mc.MakeBucket(ctx, bucketName, minio.MakeBucketOptions{})
	}

	// Start backend container
	_ = o.startBackendContainer(req.Slug)

	// Auto-create owner account on child backend container
	go func(slug, name, adminUser, adminPass string) {
		time.Sleep(1500 * time.Millisecond)
		childSetupURL := fmt.Sprintf("http://stovo-backend-%s:8000/api/auth/setup", slug)
		setupPayload, _ := json.Marshal(map[string]string{
			"familyName": name,
			"nickname":   adminUser,
			"password":   adminPass,
		})
		_, _ = http.Post(childSetupURL, "application/json", bytes.NewBuffer(setupPayload))
	}(req.Slug, req.Name, req.AdminUser, req.AdminPassword)

	// Generate single‑use admin invite token
	inviteToken := uuid.NewString()
	secret := []byte(os.Getenv("MASTER_SYSTEM_SECRET"))
	inviteJWT := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"server": req.Slug,
		"type":   "admin_invite",
		"jti":    inviteToken,
		"exp":    time.Now().Add(48 * time.Hour).Unix(),
	})
	signedInvite, _ := inviteJWT.SignedString(secret)
	host := r.Host
	if host == "" {
		host = os.Getenv("PUBLIC_HOST")
	}
	if host == "" {
		host = "localhost"
	}
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	inviteURL := fmt.Sprintf("%s://%s/s/%s/setup?token=%s", scheme, host, req.Slug, signedInvite)

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"id":             id,
		"slug":           req.Slug,
		"name":           req.Name,
		"admin_user":     req.AdminUser,
		"admin_password": req.AdminPassword,
		"cluster_url":    fmt.Sprintf("%s://%s/s/%s/login", scheme, host, req.Slug),
		"invite_url":     inviteURL,
	})
}

// handleListServers returns all server records.
func (o *Orchestrator) handleListServers(w http.ResponseWriter, r *http.Request) {
	rows, err := o.masterDB.Query(`SELECT id, slug, name, created_at, status FROM servers ORDER BY id`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()
	var list []ServerRecord
	for rows.Next() {
		var rec ServerRecord
		if err := rows.Scan(&rec.ID, &rec.Slug, &rec.Name, &rec.CreatedAt, &rec.Status); err != nil {
			continue
		}
		list = append(list, rec)
	}
	writeJSON(w, http.StatusOK, list)
}

// handleDeleteServer tears down a server.
func (o *Orchestrator) handleDeleteServer(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "id") // treat id param as slug for simplicity
	// Stop and remove backend container
	_ = o.stopAndRemoveContainer(slug)
	// Drop database
	dbName := "stovo_db_" + slug
	_, _ = o.masterDB.Exec(`DROP DATABASE IF EXISTS ` + dbName)
	// Delete record
	_, err := o.masterDB.Exec(`DELETE FROM servers WHERE slug=$1`, slug)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"result": "deleted"})
}

// handleGhostToken creates a short‑lived JWT that the master admin can use as a superadmin on a child server.
func (o *Orchestrator) handleGhostToken(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "id")
	secret := []byte(os.Getenv("MASTER_SYSTEM_SECRET"))
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"server":        slug,
		"is_superadmin": true,
		"exp":           time.Now().Add(2 * time.Hour).Unix(),
	})
	signed, _ := token.SignedString(secret)
	writeJSON(w, http.StatusOK, map[string]string{"ghost_token": signed})
}

// handleCreateInviteToken generates a single-use invite link for a server cluster.
func (o *Orchestrator) handleCreateInviteToken(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "id")
	inviteToken := uuid.NewString()
	secret := []byte(os.Getenv("MASTER_SYSTEM_SECRET"))
	inviteJWT := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"server": slug,
		"type":   "admin_invite",
		"jti":    inviteToken,
		"exp":    time.Now().Add(48 * time.Hour).Unix(),
	})
	signedInvite, _ := inviteJWT.SignedString(secret)
	host := r.Host
	if host == "" {
		host = os.Getenv("PUBLIC_HOST")
	}
	if host == "" {
		host = "localhost"
	}
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	inviteURL := fmt.Sprintf("%s://%s/s/%s/setup?token=%s", scheme, host, slug, signedInvite)
	writeJSON(w, http.StatusOK, map[string]string{"invite_url": inviteURL})
}

// handleResolve returns the public base URLs for a given server slug.
func (o *Orchestrator) handleResolve(w http.ResponseWriter, r *http.Request) {
	slug := r.URL.Query().Get("code")
	if slug == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "code query missing"})
		return
	}
	// Check that server exists
	var exists bool
	err := o.masterDB.QueryRow(`SELECT EXISTS (SELECT 1 FROM servers WHERE slug=$1)`, slug).Scan(&exists)
	if err != nil || !exists {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "server not found"})
		return
	}
	host := os.Getenv("PUBLIC_HOST")
	writeJSON(w, http.StatusOK, map[string]string{
		"cluster_id":   slug,
		"api_base_url": fmt.Sprintf("https://%s/s/%s/api", host, slug),
		"ws_base_url":  fmt.Sprintf("wss://%s/s/%s/socket.io", host, slug),
	})
}

func parseEnvSlice(env []string) map[string]string {
	m := make(map[string]string, len(env))
	for _, e := range env {
		idx := strings.IndexByte(e, '=')
		if idx > 0 {
			m[e[:idx]] = e[idx+1:]
		}
	}
	return m
}

// startBackendContainer starts a child Go backend container for a server cluster on the shared docker network.
func (o *Orchestrator) startBackendContainer(slug string) error {
	ctx := context.Background()
	containerName := fmt.Sprintf("stovo-backend-%s", slug)

	netName := os.Getenv("DOCKER_NETWORK_NAME")
	if netName == "" {
		netName = "stovo_default"
	}

	desiredEnv := backendContainerEnv(slug, func(key, fallback string) string {
		if value := config.GetOrReloadEnv(key); value != "" && !config.IsPlaceholderKey(value) {
			return value
		}
		return fallback
	})

	cfg := &container.Config{
		Image:  "stovo-backend:latest",
		Env:    desiredEnv,
		Labels: map[string]string{"stovo-server": slug},
	}
	hostCfg := &container.HostConfig{
		NetworkMode:   container.NetworkMode(netName),
		RestartPolicy: container.RestartPolicy{Name: "unless-stopped"},
	}

	// Check if container already exists
	filterArgs := filters.NewArgs()
	filterArgs.Add("name", "^/"+containerName+"$")
	filterArgs.Add("name", "^"+containerName+"$")
	containers, err := o.dockerClient.ContainerList(ctx, container.ListOptions{All: true, Filters: filterArgs})
	if err == nil && len(containers) > 0 {
		existing := containers[0]
		inspect, inspectErr := o.dockerClient.ContainerInspect(ctx, existing.ID)
		needsRecreate := false
		if inspectErr != nil {
			needsRecreate = true
		} else {
			existingEnv := parseEnvSlice(inspect.Config.Env)
			desiredEnvMap := parseEnvSlice(desiredEnv)
			for k, v := range desiredEnvMap {
				if existingEnv[k] != v {
					needsRecreate = true
					break
				}
			}
		}

		if !needsRecreate {
			if existing.State != "running" {
				return o.dockerClient.ContainerStart(ctx, existing.ID, container.StartOptions{})
			}
			return nil
		}

		timeoutSec := 5
		_ = o.dockerClient.ContainerStop(ctx, existing.ID, container.StopOptions{Timeout: &timeoutSec})
		_ = o.dockerClient.ContainerRemove(ctx, existing.ID, container.RemoveOptions{Force: true})
	}

	resp, err := o.dockerClient.ContainerCreate(ctx, cfg, hostCfg, nil, nil, containerName)
	if err != nil {
		return err
	}
	if err := o.dockerClient.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return err
	}
	log.Printf("[orchestrator] Started container %s on network %s for server %s", resp.ID, netName, slug)
	return nil
}

// backendContainerEnv builds the environment required by a tenant backend.
// TURN is shared by all tenant backends but the credentials must be present in
// each one because it mints the ICE server list returned to call clients.
func backendContainerEnv(slug string, get func(key, fallback string) string) []string {
	pgUser := get("POSTGRES_USER", "postgres")
	pgPass := get("POSTGRES_PASSWORD", "postgres")
	minioUser := get("MINIO_ROOT_USER", "stovo_minio_root")
	minioPass := get("MINIO_ROOT_PASSWORD", "stovo_minio_pass")
	masterSecret := get("MASTER_SYSTEM_SECRET", "")
	turnHost := get("TURN_HOST", get("PUBLIC_HOST", get("PUBLIC_IP", "")))
	appURL := strings.TrimRight(get("APP_URL", "http://localhost:8000"), "/")
	serverURL := fmt.Sprintf("%s/s/%s", appURL, slug)

	groqKey := get("GROQ_API_KEY", get("groq_api_key", get("GROQ_KEY", get("GROQ_API_TOKEN", ""))))

	return []string{
		fmt.Sprintf("SERVER_ID=%s", slug),
		fmt.Sprintf("APP_URL=%s", serverURL),
		fmt.Sprintf("API_URL=%s", serverURL),
		fmt.Sprintf("DATABASE_URL=postgres://%s:%s@postgres:5432/stovo_db_%s?sslmode=disable", pgUser, pgPass, slug),
		"REDIS_URL=redis://redis:6379/0",
		"MINIO_ENDPOINT=minio:9000",
		fmt.Sprintf("MINIO_ACCESS_KEY=%s", minioUser),
		fmt.Sprintf("MINIO_SECRET_KEY=%s", minioPass),
		fmt.Sprintf("MINIO_FILES_BUCKET=stovo-%s", slug),
		fmt.Sprintf("JWT_SECRET=%s", masterSecret),
		fmt.Sprintf("MASTER_SYSTEM_SECRET=%s", masterSecret),
		fmt.Sprintf("TURN_ENABLED=%s", get("TURN_ENABLED", "true")),
		fmt.Sprintf("TURN_HOST=%s", turnHost),
		fmt.Sprintf("TURN_PORT=%s", get("TURN_PORT", "3478")),
		fmt.Sprintf("TURN_REALM=%s", get("TURN_REALM", "family-messenger")),
		fmt.Sprintf("TURN_USERNAME=%s", get("TURN_USERNAME", "family")),
		fmt.Sprintf("TURN_PASSWORD=%s", get("TURN_PASSWORD", "change_me")),
		fmt.Sprintf("GROQ_API_KEY=%s", groqKey),
		fmt.Sprintf("GROQ_STT_MODEL=%s", get("GROQ_STT_MODEL", "whisper-large-v3-turbo")),
		fmt.Sprintf("GROQ_CHAT_MODEL=%s", get("GROQ_CHAT_MODEL", "")),
		fmt.Sprintf("GROQ_STT_COST_PER_AUDIO_HOUR_USD=%s", get("GROQ_STT_COST_PER_AUDIO_HOUR_USD", "0.04")),
		fmt.Sprintf("AI_CALL_TRANSCRIPTION_ENABLED=%s", get("AI_CALL_TRANSCRIPTION_ENABLED", "true")),
		fmt.Sprintf("LIVEKIT_URL=%s", get("LIVEKIT_URL", "")),
		fmt.Sprintf("LIVEKIT_API_KEY=%s", get("LIVEKIT_API_KEY", "")),
		fmt.Sprintf("LIVEKIT_API_SECRET=%s", get("LIVEKIT_API_SECRET", "")),
	}
}

func (o *Orchestrator) stopAndRemoveContainer(slug string) error {
	ctx := context.Background()
	containerName := fmt.Sprintf("stovo-backend-%s", slug)
	// Find container by name
	filterArgs := filters.NewArgs()
	filterArgs.Add("name", containerName)
	containers, err := o.dockerClient.ContainerList(ctx, container.ListOptions{All: true, Filters: filterArgs})
	if err != nil {
		return err
	}
	for _, c := range containers {
		timeoutSec := 10
		_ = o.dockerClient.ContainerStop(ctx, c.ID, container.StopOptions{Timeout: &timeoutSec})
		_ = o.dockerClient.ContainerRemove(ctx, c.ID, container.RemoveOptions{Force: true, RemoveVolumes: true})
		log.Printf("[orchestrator] Stopped and removed container %s for server %s", c.ID, slug)
	}
	return nil
}
