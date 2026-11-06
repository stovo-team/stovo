// orchestrator/routes.go
package orchestrator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"stovo-messenger/backend/internal/config"
)

type NavTabsConfig struct {
	Chats    bool `json:"chats"`
	Storage  bool `json:"storage"`
	Plans    bool `json:"plans"`
	Settings bool `json:"settings"`
}

func defaultNavTabs() NavTabsConfig {
	return NavTabsConfig{
		Chats:    true,
		Storage:  true,
		Plans:    true,
		Settings: true,
	}
}

type ChatTypesConfig struct {
	Direct  bool `json:"direct"`
	Group   bool `json:"group"`
	Channel bool `json:"channel"`
	Voice   bool `json:"voice"`
}

func defaultChatTypes() ChatTypesConfig {
	return ChatTypesConfig{Direct: true, Group: true, Channel: true, Voice: true}
}

type ServerRecord struct {
	ID        int             `json:"id"`
	Slug      string          `json:"slug"`
	Name      string          `json:"name"`
	CreatedAt time.Time       `json:"created_at"`
	Status    string          `json:"status"`
	NavTabs   NavTabsConfig   `json:"nav_tabs"`
	ChatTypes ChatTypesConfig `json:"chat_types"`
}

func getMasterSecret() []byte {
	secret := os.Getenv("MASTER_SYSTEM_SECRET")
	if secret == "" {
		secret = "super_secret_master_key_123"
	}
	return []byte(secret)
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
	if adminUser == "" {
		adminUser = "admin"
	}
	adminPass := os.Getenv("MASTER_ADMIN_PASSWORD")
	if adminPass == "" {
		adminPass = "changeme_master_pass"
	}
	if req.Username != adminUser || req.Password != adminPass {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
		return
	}
	secret := getMasterSecret()
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
		secret := getMasterSecret()
		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			return secret, nil
		})
		if err != nil || !token.Valid {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid token"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// handleCreateServer provisions a new child server and returns its first-owner invitation.
func (o *Orchestrator) handleCreateServer(w http.ResponseWriter, r *http.Request) {
	type createReq struct {
		Slug      string           `json:"slug"`
		Name      string           `json:"name"`
		NavTabs   *NavTabsConfig   `json:"nav_tabs,omitempty"`
		ChatTypes *ChatTypesConfig `json:"chat_types,omitempty"`
	}
	var req createReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid payload"})
		return
	}
	// Always auto-generate a random 8-character hash slug
	req.Slug = strings.ReplaceAll(uuid.NewString(), "-", "")[:8]

	navTabs := defaultNavTabs()
	if req.NavTabs != nil {
		navTabs = *req.NavTabs
	}
	chatTypes := defaultChatTypes()
	if req.ChatTypes != nil {
		chatTypes = *req.ChatTypes
	}
	navTabsJSON, _ := json.Marshal(navTabs)
	chatTypesJSON, _ := json.Marshal(chatTypes)

	// Insert server record
	var id int
	err := o.masterDB.QueryRow(`INSERT INTO servers (slug, name, status, nav_tabs, chat_types, require_setup_invite) VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`, req.Slug, req.Name, "created", string(navTabsJSON), string(chatTypesJSON)).Scan(&id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	// Create PostgreSQL database and schema for the server
	dbName := "stovo_db_" + req.Slug
	if _, err := o.masterDB.Exec(`CREATE DATABASE ` + dbName); err != nil {
		_, _ = o.masterDB.Exec(`DELETE FROM servers WHERE id = $1`, id)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create server database"})
		return
	}
	// Create the tenant bucket in the configured S3-compatible storage.
	minioEndpoint := os.Getenv("MINIO_ENDPOINT")
	minioAccessKey := os.Getenv("MINIO_ACCESS_KEY")
	minioSecretKey := os.Getenv("MINIO_SECRET_KEY")
	if !strings.EqualFold(os.Getenv("STORAGE_PROVIDER"), "s3") {
		minioAccessKey = os.Getenv("MINIO_ROOT_USER")
		minioSecretKey = os.Getenv("MINIO_ROOT_PASSWORD")
	}
	secure, _ := strconv.ParseBool(os.Getenv("MINIO_SECURE"))
	mc, err := minio.New(minioEndpoint, &minio.Options{
		Creds:        credentials.NewStaticV4(minioAccessKey, minioSecretKey, ""),
		Secure:       secure,
		BucketLookup: minio.BucketLookupPath,
	})
	if err == nil {
		bucketName := fmt.Sprintf("stovo-%s", req.Slug)
		ctx := context.Background()
		_ = mc.MakeBucket(ctx, bucketName, minio.MakeBucketOptions{})
	}

	// Apply the complete migration set before the tenant ever serves traffic.
	// startBackendContainer also does this for existing tenants whenever the
	// orchestrator reconciles them after a deploy or restart.
	if err := o.startBackendContainer(req.Slug); err != nil {
		log.Printf("[orchestrator] failed to initialize server %s: %v", dbName, err)
		_, _ = o.masterDB.Exec(`DROP DATABASE ` + dbName)
		_, _ = o.masterDB.Exec(`DELETE FROM servers WHERE id = $1`, id)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to initialize server database"})
		return
	}

	// Generate single‑use admin invite token
	inviteToken := uuid.NewString()
	secret := getMasterSecret()
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
		"id":          id,
		"slug":        req.Slug,
		"name":        req.Name,
		"cluster_url": fmt.Sprintf("%s://%s/s/%s/login", scheme, host, req.Slug),
		"invite_url":  inviteURL,
		"nav_tabs":    navTabs,
		"chat_types":  chatTypes,
	})
}

// handleListServers returns all server records.
func (o *Orchestrator) handleListServers(w http.ResponseWriter, r *http.Request) {
	rows, err := o.masterDB.Query(`SELECT id, slug, name, created_at, status, COALESCE(nav_tabs::text, ''), COALESCE(chat_types::text, '') FROM servers ORDER BY id`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer func() { _ = rows.Close() }()
	var list []ServerRecord
	for rows.Next() {
		var rec ServerRecord
		var navTabsStr, chatTypesStr string
		rec.NavTabs = defaultNavTabs()
		rec.ChatTypes = defaultChatTypes()
		if err := rows.Scan(&rec.ID, &rec.Slug, &rec.Name, &rec.CreatedAt, &rec.Status, &navTabsStr, &chatTypesStr); err != nil {
			continue
		}
		if navTabsStr != "" {
			_ = json.Unmarshal([]byte(navTabsStr), &rec.NavTabs)
		}
		if chatTypesStr != "" {
			_ = json.Unmarshal([]byte(chatTypesStr), &rec.ChatTypes)
		}
		list = append(list, rec)
	}
	writeJSON(w, http.StatusOK, list)
}

// handleGetServerSettings returns server configuration including enabled navigation tabs.
func (o *Orchestrator) handleGetServerSettings(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "id")
	var rec ServerRecord
	var navTabsStr, chatTypesStr string
	rec.NavTabs = defaultNavTabs()
	rec.ChatTypes = defaultChatTypes()
	err := o.masterDB.QueryRow(`SELECT id, slug, name, created_at, status, COALESCE(nav_tabs::text, ''), COALESCE(chat_types::text, '') FROM servers WHERE slug=$1`, slug).
		Scan(&rec.ID, &rec.Slug, &rec.Name, &rec.CreatedAt, &rec.Status, &navTabsStr, &chatTypesStr)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "server not found"})
		return
	}
	if navTabsStr != "" {
		_ = json.Unmarshal([]byte(navTabsStr), &rec.NavTabs)
	}
	if chatTypesStr != "" {
		_ = json.Unmarshal([]byte(chatTypesStr), &rec.ChatTypes)
	}
	writeJSON(w, http.StatusOK, rec)
}

// handleUpdateServerSettings updates server configuration including navigation tabs.
func (o *Orchestrator) handleUpdateServerSettings(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "id")
	type updateSettingsReq struct {
		Name      *string          `json:"name,omitempty"`
		NavTabs   *NavTabsConfig   `json:"nav_tabs,omitempty"`
		ChatTypes *ChatTypesConfig `json:"chat_types,omitempty"`
	}
	var req updateSettingsReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid payload"})
		return
	}

	var rec ServerRecord
	var navTabsStr, chatTypesStr string
	rec.NavTabs = defaultNavTabs()
	rec.ChatTypes = defaultChatTypes()
	err := o.masterDB.QueryRow(`SELECT id, slug, name, created_at, status, COALESCE(nav_tabs::text, ''), COALESCE(chat_types::text, '') FROM servers WHERE slug=$1`, slug).
		Scan(&rec.ID, &rec.Slug, &rec.Name, &rec.CreatedAt, &rec.Status, &navTabsStr, &chatTypesStr)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "server not found"})
		return
	}
	if navTabsStr != "" {
		_ = json.Unmarshal([]byte(navTabsStr), &rec.NavTabs)
	}
	if chatTypesStr != "" {
		_ = json.Unmarshal([]byte(chatTypesStr), &rec.ChatTypes)
	}

	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		rec.Name = strings.TrimSpace(*req.Name)
	}
	if req.NavTabs != nil {
		rec.NavTabs = *req.NavTabs
	}
	if req.ChatTypes != nil {
		rec.ChatTypes = *req.ChatTypes
	}

	navTabsJSON, _ := json.Marshal(rec.NavTabs)
	chatTypesJSON, _ := json.Marshal(rec.ChatTypes)
	_, err = o.masterDB.Exec(`UPDATE servers SET name=$1, nav_tabs=$2, chat_types=$3 WHERE slug=$4`, rec.Name, string(navTabsJSON), string(chatTypesJSON), slug)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// Reconcile/restart backend container with new environment. This also
	// applies any migrations bundled in the current backend image.
	if err := o.startBackendContainer(slug); err != nil {
		log.Printf("[orchestrator] failed to reconcile server %s: %v", slug, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to update server runtime"})
		return
	}

	writeJSON(w, http.StatusOK, rec)
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
	secret := getMasterSecret()
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
	secret := getMasterSecret()
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

func (o *Orchestrator) getServerColumn(slug, col, fallback string) string {
	if o.masterDB == nil {
		return fallback
	}
	var val string
	if err := o.masterDB.QueryRow(fmt.Sprintf(`SELECT COALESCE(%s::text, '') FROM servers WHERE slug=$1`, col), slug).Scan(&val); err != nil || val == "" {
		return fallback
	}
	return val
}

func (o *Orchestrator) getNavTabsForServer(slug string) string {
	return o.getServerColumn(slug, "nav_tabs", `{"chats":true,"storage":true,"plans":true,"settings":true}`)
}
func (o *Orchestrator) getChatTypesForServer(slug string) string {
	return o.getServerColumn(slug, "chat_types", `{"direct":true,"group":true,"channel":true,"voice":true}`)
}
func (o *Orchestrator) getSetupInviteRequiredForServer(slug string) string {
	return o.getServerColumn(slug, "require_setup_invite", "false")
}
func (o *Orchestrator) getNameForServer(slug string) string {
	return o.getServerColumn(slug, "name", "")
}

// startBackendContainer starts a child Go backend container for a server cluster on the shared docker network.
func (o *Orchestrator) startBackendContainer(slug string) error {
	// Existing tenant databases must be upgraded too. Previously migrations ran
	// only during tenant creation, leaving deployed code able to reference
	// columns that older tenant databases did not have.
	if err := o.initChildDBSchema(slug); err != nil {
		return fmt.Errorf("apply tenant migrations: %w", err)
	}

	ctx := context.Background()
	containerName := fmt.Sprintf("stovo-backend-%s", slug)

	netName := os.Getenv("DOCKER_NETWORK_NAME")
	if netName == "" {
		netName = "stovo_default"
	}

	desiredEnv := backendContainerEnv(slug, func(key, fallback string) string {
		switch key {
		case "NAV_TABS":
			return o.getNavTabsForServer(slug)
		case "CHAT_TYPES":
			return o.getChatTypesForServer(slug)
		case "SERVER_NAME":
			return o.getNameForServer(slug)
		case "REQUIRE_SETUP_INVITE":
			return o.getSetupInviteRequiredForServer(slug)
		}
		if value := config.GetOrReloadEnv(key); value != "" && !config.IsPlaceholderKey(value) {
			return value
		}
		return fallback
	})

	desiredImage := getTenantBackendImage()
	cfg := &container.Config{
		Image:  desiredImage,
		Env:    desiredEnv,
		Labels: map[string]string{"stovo-server": slug},
	}
	hostCfg := &container.HostConfig{
		NetworkMode:   container.NetworkMode(netName),
		RestartPolicy: container.RestartPolicy{Name: "unless-stopped"},
		DNS:           []string{"77.88.8.8", "1.1.1.1", "8.8.8.8"},
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
			if needsRecreate, err = o.backendImageChanged(ctx, desiredImage, inspect); err != nil {
				return err
			}
			existingEnv := parseEnvSlice(inspect.Config.Env)
			desiredEnvMap := parseEnvSlice(desiredEnv)
			if intelligenceEnvironmentChanged(existingEnv, desiredEnvMap) {
				needsRecreate = true
			}
			for k, v := range desiredEnvMap {
				if existingEnv[k] != v {
					needsRecreate = true
					break
				}
			}
			if inspect.HostConfig == nil || len(inspect.HostConfig.DNS) == 0 {
				needsRecreate = true
			}
		}

		if !needsRecreate {
			if err := o.attachProxyNetwork(ctx, existing.ID, slug); err != nil {
				return fmt.Errorf("attach trusted proxy network: %w", err)
			}
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
	if err := o.attachProxyNetwork(ctx, resp.ID, slug); err != nil {
		_ = o.dockerClient.ContainerRemove(ctx, resp.ID, container.RemoveOptions{Force: true})
		return fmt.Errorf("attach trusted proxy network: %w", err)
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
	storageProvider := get("STORAGE_PROVIDER", "minio")
	minioEndpoint := get("MINIO_ENDPOINT", "minio:9000")
	minioSecure := get("MINIO_SECURE", "false")
	minioUser := get("MINIO_ROOT_USER", "stovo_minio_root")
	minioPass := get("MINIO_ROOT_PASSWORD", "stovo_minio_pass")
	if strings.EqualFold(storageProvider, "s3") {
		minioUser = get("MINIO_ACCESS_KEY", "")
		minioPass = get("MINIO_SECRET_KEY", "")
	}
	masterSecret := get("MASTER_SYSTEM_SECRET", "")
	turnHost := get("TURN_HOST", get("PUBLIC_HOST", get("PUBLIC_IP", "")))
	appURL := strings.TrimRight(get("APP_URL", "http://localhost:8000"), "/")
	serverURL := fmt.Sprintf("%s/s/%s", appURL, slug)

	groqKey := get("GROQ_API_KEY", get("groq_api_key", get("GROQ_KEY", get("GROQ_API_TOKEN", ""))))
	navTabs := get("NAV_TABS", `{"chats":true,"storage":true,"plans":true,"settings":true}`)
	chatTypes := get("CHAT_TYPES", `{"direct":true,"group":true,"channel":true,"voice":true}`)
	databaseURL := strings.TrimSpace(get("DATABASE_URL", ""))
	if databaseURL == "" {
		databaseURL = fmt.Sprintf("postgres://%s:%s@postgres:5432/stovo_db_%s?sslmode=disable", pgUser, pgPass, slug)
	} else {
		// A multi-tenant external Postgres deployment can use {slug} in its URL
		// to retain one database per tenant. A URL without the placeholder is
		// intentionally supported for a single existing tenant.
		databaseURL = strings.ReplaceAll(databaseURL, "{slug}", slug)
	}
	redisURL := strings.TrimSpace(get("REDIS_URL", ""))
	if redisURL == "" {
		redisURL = "redis://redis:6379/0"
	}

	return appendIntelligenceEnvironment([]string{
		fmt.Sprintf("SERVER_ID=%s", slug),
		fmt.Sprintf("REQUIRE_SETUP_INVITE=%s", get("REQUIRE_SETUP_INVITE", "false")),
		fmt.Sprintf("APP_URL=%s", serverURL),
		fmt.Sprintf("API_URL=%s", serverURL),
		fmt.Sprintf("DATABASE_URL=%s", databaseURL),
		fmt.Sprintf("POSTGRES_HOST=%s", get("POSTGRES_HOST", "postgres")),
		fmt.Sprintf("POSTGRES_PORT=%s", get("POSTGRES_PORT", "5432")),
		fmt.Sprintf("POSTGRES_USER=%s", pgUser),
		fmt.Sprintf("POSTGRES_PASSWORD=%s", pgPass),
		fmt.Sprintf("POSTGRES_DB=stovo_db_%s", slug),
		fmt.Sprintf("REDIS_URL=%s", redisURL),
		fmt.Sprintf("STORAGE_PROVIDER=%s", storageProvider),
		fmt.Sprintf("MINIO_ENDPOINT=%s", minioEndpoint),
		fmt.Sprintf("MINIO_SECURE=%s", minioSecure),
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
		fmt.Sprintf("GROQ_BASE_URL=%s", get("GROQ_BASE_URL", get("GROQ_API_BASE", ""))),
		fmt.Sprintf("GROQ_STT_MODEL=%s", get("GROQ_STT_MODEL", "qwen3-asr-flash-2025-09-08")),
		fmt.Sprintf("GROQ_CHAT_MODEL=%s", get("GROQ_CHAT_MODEL", "")),
		fmt.Sprintf("GROQ_STT_COST_PER_AUDIO_HOUR_USD=%s", get("GROQ_STT_COST_PER_AUDIO_HOUR_USD", "0.04")),
		fmt.Sprintf("AI_CALL_TRANSCRIPTION_ENABLED=%s", get("AI_CALL_TRANSCRIPTION_ENABLED", "true")),
		fmt.Sprintf("LIVEKIT_URL=%s", get("LIVEKIT_URL", "")),
		fmt.Sprintf("LIVEKIT_API_KEY=%s", get("LIVEKIT_API_KEY", "")),
		fmt.Sprintf("LIVEKIT_API_SECRET=%s", get("LIVEKIT_API_SECRET", "")),
		fmt.Sprintf("NAV_TABS=%s", navTabs),
		fmt.Sprintf("CHAT_TYPES=%s", chatTypes),
		fmt.Sprintf("SERVER_NAME=%s", strings.TrimSpace(get("SERVER_NAME", ""))),
		fmt.Sprintf("TRUSTED_PROXY_CIDRS=%s", get("TRUSTED_PROXY_CIDRS", "172.34.0.2/32")),
	}, slug, get)
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

func (o *Orchestrator) initChildDBSchema(slug string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	netName := os.Getenv("DOCKER_NETWORK_NAME")
	if netName == "" {
		netName = "stovo_default"
	}
	env := backendContainerEnv(slug, func(key, fallback string) string {
		switch key {
		case "NAV_TABS":
			return o.getNavTabsForServer(slug)
		case "CHAT_TYPES":
			return o.getChatTypesForServer(slug)
		case "SERVER_NAME":
			return o.getNameForServer(slug)
		case "REQUIRE_SETUP_INVITE":
			return o.getSetupInviteRequiredForServer(slug)
		}
		if value := config.GetOrReloadEnv(key); value != "" && !config.IsPlaceholderKey(value) {
			return value
		}
		return fallback
	})
	name := fmt.Sprintf("stovo-migrate-%s-%s", slug, uuid.NewString()[:8])
	containerID := ""
	defer func() {
		if containerID != "" {
			_ = o.dockerClient.ContainerRemove(context.Background(), containerID, container.RemoveOptions{Force: true})
		}
	}()

	created, err := o.dockerClient.ContainerCreate(ctx, &container.Config{
		Image:      getTenantBackendImage(),
		Env:        env,
		Entrypoint: []string{"/bin/sh", "-ec"},
		Cmd:        []string{"database_url=\"$(stovo-database-url)\"; atlas migrate apply --dir file:///app/migrations --url \"$database_url\""},
	}, &container.HostConfig{
		NetworkMode: container.NetworkMode(netName),
		DNS:         []string{"77.88.8.8", "1.1.1.1", "8.8.8.8"},
	}, nil, nil, name)
	if err != nil {
		return fmt.Errorf("create Atlas migration container: %w", err)
	}
	containerID = created.ID
	if err := o.dockerClient.ContainerStart(ctx, containerID, container.StartOptions{}); err != nil {
		return fmt.Errorf("start Atlas migration container: %w", err)
	}

	statusC, errC := o.dockerClient.ContainerWait(ctx, containerID, container.WaitConditionNotRunning)
	for statusC != nil || errC != nil {
		select {
		case err, ok := <-errC:
			if !ok {
				errC = nil
				continue
			}
			if err != nil {
				return fmt.Errorf("wait for Atlas migration container: %w", err)
			}
		case status, ok := <-statusC:
			if !ok {
				statusC = nil
				continue
			}
			if status.StatusCode == 0 {
				return nil
			}
			logs, logErr := o.dockerClient.ContainerLogs(ctx, containerID, container.LogsOptions{ShowStdout: true, ShowStderr: true})
			if logErr != nil {
				// Atlas is a proper name and must retain its capitalization.
				return fmt.Errorf("Atlas migration container exited with status %d", status.StatusCode) //nolint:staticcheck
			}
			defer func() { _ = logs.Close() }()
			output, _ := io.ReadAll(io.LimitReader(logs, 8<<10))
			return fmt.Errorf("Atlas migration container exited with status %d: %s", status.StatusCode, strings.TrimSpace(string(output))) //nolint:staticcheck
		case <-ctx.Done():
			return fmt.Errorf("wait for Atlas migration container: %w", ctx.Err())
		}
	}
	return errors.New("Atlas migration container exited without a status") //nolint:staticcheck
}
