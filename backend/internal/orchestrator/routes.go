// orchestrator/routes.go
package orchestrator

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	networktypes "github.com/docker/docker/api/types/network"
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
	ID        int           `json:"id"`
	Slug      string        `json:"slug"`
	Name      string        `json:"name"`
	CreatedAt time.Time     `json:"created_at"`
	Status    string        `json:"status"`
	NavTabs   NavTabsConfig `json:"nav_tabs"`
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

// handleCreateServer provisions a new child server and auto-provisions its admin user.
func (o *Orchestrator) handleCreateServer(w http.ResponseWriter, r *http.Request) {
	type createReq struct {
		Slug          string           `json:"slug"`
		Name          string           `json:"name"`
		AdminUser     string           `json:"admin_user"`
		AdminPassword string           `json:"admin_password"`
		NavTabs       *NavTabsConfig   `json:"nav_tabs,omitempty"`
		ChatTypes     *ChatTypesConfig `json:"chat_types,omitempty"`
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
	err := o.masterDB.QueryRow(`INSERT INTO servers (slug, name, status, nav_tabs, chat_types) VALUES ($1, $2, $3, $4, $5) RETURNING id`, req.Slug, req.Name, "created", string(navTabsJSON), string(chatTypesJSON)).Scan(&id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	// Create a Space-scoped database and least-privilege runtime role.
	dbName := "stovo_db_" + req.Slug
	encryptionKey := os.Getenv("TENANT_DB_ENCRYPTION_KEY")
	if len(encryptionKey) != 32 || (pgbouncerEnabled() && validatePgBouncerAdminPassword(os.Getenv("PGBOUNCER_ADMIN_PASSWORD")) != nil) {
		_, _ = o.masterDB.Exec(`DELETE FROM servers WHERE id=$1`, id)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tenant database encryption and required database pooler secrets must be configured"})
		return
	}
	runtimeUser := "stovo_runtime_" + req.Slug
	runtimePassword := uuid.NewString() + uuid.NewString()
	encryptedPassword, err := encryptTenantDBPassword(runtimePassword, encryptionKey)
	if err != nil {
		_, _ = o.masterDB.Exec(`DELETE FROM servers WHERE id=$1`, id)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to protect tenant database credentials"})
		return
	}
	adminDB, err := o.openTenantAdminDB()
	if err == nil {
		err = provisionTenantDatabase(r.Context(), adminDB, req.Slug, runtimePassword)
		_ = adminDB.Close()
	}
	if err == nil {
		_, err = o.masterDB.Exec(`UPDATE servers SET tenant_db_runtime_user=$1, tenant_db_runtime_password_ciphertext=$2 WHERE id=$3`, runtimeUser, encryptedPassword, id)
	}
	if err == nil {
		err = o.syncPgBouncerAuth(r.Context())
	}
	if err != nil {
		if cleanupErr := o.dropTenantDatabase(req.Slug); cleanupErr != nil {
			log.Printf("[orchestrator] provisioning rollback failed for %s: %v", req.Slug, cleanupErr)
		}
		_, _ = o.masterDB.Exec(`DELETE FROM servers WHERE id = $1`, id)
		_ = o.syncPgBouncerAuth(context.Background())
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to provision tenant database"})
		return
	}
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

	// Apply the complete migration set before the tenant ever serves traffic.
	// startBackendContainer also does this for existing tenants whenever the
	// orchestrator reconciles them after a deploy or restart.
	if err := o.startBackendContainer(req.Slug); err != nil {
		log.Printf("[orchestrator] failed to initialize server %s: %v", dbName, err)
		if cleanupErr := o.dropTenantDatabase(req.Slug); cleanupErr != nil {
			log.Printf("[orchestrator] tenant database cleanup failed for %s: %v", req.Slug, cleanupErr)
		}
		_, _ = o.masterDB.Exec(`DELETE FROM servers WHERE id=$1`, id)
		_ = o.syncPgBouncerAuth(context.Background())
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to initialize server database"})
		return
	}

	// Auto-create owner account on child backend container with retries
	go func(slug, name, adminUser, adminPass string) {
		childSetupURL := fmt.Sprintf("http://stovo-backend-%s:8000/api/auth/setup", slug)
		setupPayload, _ := json.Marshal(map[string]string{
			"familyName": name,
			"nickname":   adminUser,
			"password":   adminPass,
		})
		for i := 0; i < 30; i++ {
			time.Sleep(1 * time.Second)
			resp, err := http.Post(childSetupURL, "application/json", bytes.NewBuffer(setupPayload))
			if err == nil {
				if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
					_ = resp.Body.Close()
					log.Printf("[orchestrator] Successfully auto-provisioned admin account '%s' for server '%s'", adminUser, slug)
					return
				}
				_ = resp.Body.Close()
			}
		}
		log.Printf("[orchestrator] ERROR: Failed to auto-provision admin account for server '%s' after 30 attempts", slug)
	}(req.Slug, req.Name, req.AdminUser, req.AdminPassword)

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
		"id":             id,
		"slug":           req.Slug,
		"name":           req.Name,
		"admin_user":     req.AdminUser,
		"admin_password": req.AdminPassword,
		"cluster_url":    fmt.Sprintf("%s://%s/s/%s/login", scheme, host, req.Slug),
		"invite_url":     inviteURL,
		"nav_tabs":       navTabs,
		"chat_types":     chatTypes,
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
	var exists bool
	if err := o.masterDB.QueryRow(`SELECT EXISTS (SELECT 1 FROM servers WHERE slug=$1)`, slug).Scan(&exists); err != nil || !exists {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "server not found"})
		return
	}
	// Stop and remove backend container
	if err := o.stopAndRemoveContainer(slug); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to stop server backend"})
		return
	}
	// Drop database
	if err := o.dropTenantDatabase(slug); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to delete tenant database"})
		return
	}
	// Remove the credentials from PgBouncer before deleting the registry row.
	// If this fails, the row remains so a retry can repeat the idempotent drop
	// and auth cleanup steps.
	if err := o.syncPgBouncerAuthExcluding(r.Context(), slug); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "tenant database deleted but PgBouncer credentials could not be cleared; retry deletion"})
		return
	}
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

func (o *Orchestrator) getNavTabsForServer(slug string) string {
	if o.masterDB == nil {
		return `{"chats":true,"storage":true,"plans":true,"settings":true}`
	}
	var navTabsStr string
	err := o.masterDB.QueryRow(`SELECT COALESCE(nav_tabs::text, '') FROM servers WHERE slug=$1`, slug).Scan(&navTabsStr)
	if err != nil || navTabsStr == "" {
		return `{"chats":true,"storage":true,"plans":true,"settings":true}`
	}
	return navTabsStr
}

func (o *Orchestrator) getChatTypesForServer(slug string) string {
	if o.masterDB == nil {
		return `{"direct":true,"group":true,"channel":true,"voice":true}`
	}
	var chatTypesStr string
	err := o.masterDB.QueryRow(`SELECT COALESCE(chat_types::text, '') FROM servers WHERE slug=$1`, slug).Scan(&chatTypesStr)
	if err != nil || chatTypesStr == "" {
		return `{"direct":true,"group":true,"channel":true,"voice":true}`
	}
	return chatTypesStr
}

// startBackendContainer starts a child Go backend container for a server cluster on the shared docker network.
func (o *Orchestrator) startBackendContainer(slug string) error {
	if err := o.ensureTenantCredentials(slug); err != nil {
		return fmt.Errorf("ensure tenant runtime credentials: %w", err)
	}
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
		if key == "TENANT_DB_RUNTIME_USER" || key == "TENANT_DB_RUNTIME_PASSWORD" {
			user, password, err := o.tenantRuntimeCredentials(slug)
			if err == nil {
				if key == "TENANT_DB_RUNTIME_USER" {
					return user
				}
				return password
			}
			return ""
		}
		if key == "NAV_TABS" {
			return o.getNavTabsForServer(slug)
		}
		if key == "CHAT_TYPES" {
			return o.getChatTypesForServer(slug)
		}
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
			existingEnv := parseEnvSlice(inspect.Config.Env)
			desiredEnvMap := parseEnvSlice(desiredEnv)
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

func proxyEndpointSettings(slug string) *networktypes.EndpointSettings {
	return &networktypes.EndpointSettings{Aliases: []string{fmt.Sprintf("stovo-backend-%s-proxy", slug)}}
}

func (o *Orchestrator) attachProxyNetwork(ctx context.Context, containerID, slug string) error {
	networkName := strings.TrimSpace(os.Getenv("TRUSTED_PROXY_NETWORK_NAME"))
	if networkName == "" {
		return nil
	}
	inspect, err := o.dockerClient.ContainerInspect(ctx, containerID)
	if err != nil {
		return err
	}
	alias := fmt.Sprintf("stovo-backend-%s-proxy", slug)
	if inspect.NetworkSettings != nil {
		if endpoint, ok := inspect.NetworkSettings.Networks[networkName]; ok && endpoint != nil {
			for _, existingAlias := range endpoint.Aliases {
				if existingAlias == alias {
					return nil
				}
			}
			if err := o.dockerClient.NetworkDisconnect(ctx, networkName, containerID, true); err != nil {
				return err
			}
		}
	}
	return o.dockerClient.NetworkConnect(ctx, networkName, containerID, proxyEndpointSettings(slug))
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
	navTabs := get("NAV_TABS", `{"chats":true,"storage":true,"plans":true,"settings":true}`)
	chatTypes := get("CHAT_TYPES", `{"direct":true,"group":true,"channel":true,"voice":true}`)
	usePgBouncer := strings.EqualFold(get("PGBOUNCER_ENABLED", "false"), "true")
	directURL := strings.TrimSpace(get("DATABASE_URL", ""))
	if directURL == "" {
		directURL = fmt.Sprintf("postgres://%s@postgres:5432/stovo_db_{slug}?sslmode=disable", url.UserPassword(pgUser, pgPass).String())
	}
	runtimeUser, runtimePassword := get("TENANT_DB_RUNTIME_USER", ""), get("TENANT_DB_RUNTIME_PASSWORD", "")
	var upstreamErr error
	if usePgBouncer {
		if upstreamHost := strings.TrimSpace(get("PGBOUNCER_UPSTREAM_HOST", "")); upstreamHost != "" {
			upstreamErr = validatePgBouncerUpstream(directURL, upstreamHost, get("PGBOUNCER_UPSTREAM_PORT", "5432"))
		}
	}
	databaseURL, migrationURL, urlErr := buildTenantDatabaseURLsWithPooler(slug, directURL, get("PGBOUNCER_HOST", "pgbouncer"), get("PGBOUNCER_PORT", "6432"), runtimeUser, runtimePassword, usePgBouncer)
	if upstreamErr != nil {
		log.Printf("[orchestrator] invalid PgBouncer upstream config: %v", upstreamErr)
		databaseURL, migrationURL = "", ""
	} else if urlErr != nil {
		log.Printf("[orchestrator] invalid tenant database URL config: %v", urlErr)
		databaseURL, migrationURL = "", ""
	}
	redisURL := strings.TrimSpace(get("REDIS_URL", ""))
	if redisURL == "" {
		redisURL = "redis://redis:6379/0"
	}

	return []string{
		fmt.Sprintf("SERVER_ID=%s", slug),
		fmt.Sprintf("APP_URL=%s", serverURL),
		fmt.Sprintf("API_URL=%s", serverURL),
		fmt.Sprintf("DATABASE_URL=%s", databaseURL),
		"DATABASE_URL_DISABLE_LOCAL_FALLBACK=true",
		fmt.Sprintf("MIGRATION_DATABASE_URL=%s", migrationURL),
		fmt.Sprintf("POSTGRES_HOST=%s", get("POSTGRES_HOST", "postgres")),
		fmt.Sprintf("POSTGRES_PORT=%s", get("POSTGRES_PORT", "5432")),
		fmt.Sprintf("POSTGRES_USER=%s", runtimeUser),
		fmt.Sprintf("POSTGRES_PASSWORD=%s", runtimePassword),
		fmt.Sprintf("POSTGRES_DB=stovo_db_%s", slug),
		fmt.Sprintf("REDIS_URL=%s", redisURL),
		fmt.Sprintf("STORAGE_PROVIDER=%s", get("STORAGE_PROVIDER", "minio")),
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
		fmt.Sprintf("TRUSTED_PROXY_CIDRS=%s", get("TRUSTED_PROXY_CIDRS", "172.33.0.2/32")),
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
	var lifecycleErr error
	for _, c := range containers {
		if c.State == "running" {
			timeoutSec := 10
			if err := o.dockerClient.ContainerStop(ctx, c.ID, container.StopOptions{Timeout: &timeoutSec}); err != nil {
				lifecycleErr = errors.Join(lifecycleErr, fmt.Errorf("stop backend container %s: %w", c.ID, err))
				continue
			}
		}
		if err := o.dockerClient.ContainerRemove(ctx, c.ID, container.RemoveOptions{Force: true, RemoveVolumes: true}); err != nil {
			lifecycleErr = errors.Join(lifecycleErr, fmt.Errorf("remove backend container %s: %w", c.ID, err))
			continue
		}
		log.Printf("[orchestrator] Stopped and removed container %s for server %s", c.ID, slug)
	}
	return lifecycleErr
}

func (o *Orchestrator) initChildDBSchema(slug string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	netName := os.Getenv("DOCKER_NETWORK_NAME")
	if netName == "" {
		netName = "stovo_default"
	}
	env := backendContainerEnv(slug, func(key, fallback string) string {
		if key == "TENANT_DB_RUNTIME_USER" || key == "TENANT_DB_RUNTIME_PASSWORD" {
			user, password, err := o.tenantRuntimeCredentials(slug)
			if err == nil {
				if key == "TENANT_DB_RUNTIME_USER" {
					return user
				}
				return password
			}
			return ""
		}
		if value := config.GetOrReloadEnv(key); value != "" && !config.IsPlaceholderKey(value) {
			return value
		}
		return fallback
	})
	envMap := parseEnvSlice(env)
	name := fmt.Sprintf("stovo-migrate-%s-%s", slug, uuid.NewString()[:8])
	containerID := ""
	defer func() {
		if containerID != "" {
			_ = o.dockerClient.ContainerRemove(context.Background(), containerID, container.RemoveOptions{Force: true})
		}
	}()

	created, err := o.dockerClient.ContainerCreate(ctx, &container.Config{
		Image:      "stovo-backend:latest",
		Env:        env,
		Entrypoint: []string{"/bin/sh", "-ec"},
		Cmd:        []string{"atlas migrate apply --dir file:///app/migrations --url \"$MIGRATION_DATABASE_URL\""},
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
				if err := grantTenantRuntimePrivileges(envMap["MIGRATION_DATABASE_URL"], envMap["TENANT_DB_RUNTIME_USER"]); err != nil {
					return fmt.Errorf("grant runtime database privileges: %w", err)
				}
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
