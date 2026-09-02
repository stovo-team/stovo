package app

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/textproto"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"
	"time"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/ent/chatmember"
	"stovo-messenger/backend/internal/config"
	"stovo-messenger/backend/internal/repository"
	"stovo-messenger/backend/internal/storage"

	socketio "github.com/doquangtan/socketio/v4"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

func testPersistenceClient(t *testing.T, server *Server) *ent.Client {
	t.Helper()
	client, ok := server.persistence.(*ent.Client)
	if !ok {
		t.Fatalf("persistence client is %T, want *ent.Client", server.persistence)
	}
	return client
}

func testPersistenceStore(t *testing.T, server *Server) *repository.Store {
	t.Helper()
	return repository.New(testPersistenceClient(t, server))
}

func newTestServer(t *testing.T) (*Server, *httptest.Server, *http.Client) {
	t.Helper()
	root := t.TempDir()
	databaseURL := strings.TrimSpace(os.Getenv("TEST_DATABASE_URL"))
	if databaseURL == "" {
		databaseURL = strings.TrimSpace(os.Getenv("DATABASE_URL"))
	}
	redisURL := strings.TrimSpace(os.Getenv("TEST_REDIS_URL"))
	if redisURL == "" {
		redisURL = strings.TrimSpace(os.Getenv("REDIS_URL"))
	}
	if databaseURL == "" || redisURL == "" {
		t.Skip("runtime integration tests require TEST_DATABASE_URL and TEST_REDIS_URL")
	}
	resetTestRuntime(t, databaseURL, redisURL)
	cfg := config.Config{
		AppName:               "family-messenger-backend",
		AppVersion:            "0.1.0",
		AppEnv:                "development",
		Host:                  "127.0.0.1",
		Port:                  0,
		AppURL:                "http://localhost:5173",
		APIURL:                "http://localhost:8000",
		FrontendOrigin:        "http://localhost:5173",
		PublicTunnelOrigin:    "http://127.0.0.1:8000",
		DatabaseURL:           databaseURL,
		RedisURL:              redisURL,
		JWTSecret:             "test-access-secret",
		RefreshTokenSecret:    "test-refresh-secret",
		InviteTokenSecret:     "test-invite-secret",
		RefreshCookieName:     "family_refresh_token",
		AccessTokenTTL:        15 * time.Minute,
		RefreshTokenTTL:       30 * 24 * time.Hour,
		MediaPlaybackTokenTTL: 12 * time.Hour,
		MaxUploadSizeBytes:    100 * 1024 * 1024,
		LocalStoragePath:      filepath.Join(root, "uploads"),
		LogFilePath:           filepath.Join(root, "logs", "backend.log"),
		LogBufferMaxRecords:   2000,
	}
	server, err := NewWithDependencies(newIntegrationTestDependencies(t, cfg))
	if err != nil {
		t.Fatalf("new server: %v", err)
	}
	httpServer := httptest.NewServer(server.Routes())
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar}
	t.Cleanup(func() {
		httpServer.Close()
		_ = server.Close()
	})
	return server, httpServer, client
}

func TestPostgresPrivacyPreferencesDoNotBreakLogin(t *testing.T) {
	_, serverURL, client := newTestServer(t)
	setupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Privacy Login Family",
		"username":    "privacy-login-owner",
		"password":    "secure-password",
		"displayName": "Privacy Login Owner",
	})
	if setupResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup status = %d, want %d", setupResp.StatusCode, http.StatusCreated)
	}
	_ = setupResp.Body.Close()

	loginResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/login", "", map[string]any{
		"username": "privacy-login-owner",
		"password": "secure-password",
	})
	if loginResp.StatusCode != http.StatusOK {
		t.Fatalf("login status = %d, want %d", loginResp.StatusCode, http.StatusOK)
	}
	_ = loginResp.Body.Close()
}

func TestChangePasswordUpdatesOnlyTheAuthenticatedUserAndRevokesOtherSessions(t *testing.T) {
	_, serverURL, client := newTestServer(t)
	setupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Password Change Family",
		"username":    "password-owner",
		"password":    "secure-password",
		"displayName": "Password Owner",
	})
	if setupResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup status = %d, want %d", setupResp.StatusCode, http.StatusCreated)
	}
	owner := decodeJSON[authResponse](t, setupResp)

	secondDeviceJar, _ := cookiejar.New(nil)
	secondDevice := &http.Client{Jar: secondDeviceJar}
	secondLoginResp := jsonRequest(t, secondDevice, http.MethodPost, serverURL.URL+"/api/auth/login", "", map[string]any{
		"username": "password-owner",
		"password": "secure-password",
	})
	if secondLoginResp.StatusCode != http.StatusOK {
		t.Fatalf("second-device login status = %d, want %d", secondLoginResp.StatusCode, http.StatusOK)
	}
	_ = secondLoginResp.Body.Close()

	changeResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/change-password", owner.AccessToken, map[string]any{
		"currentPassword": "secure-password",
		"newPassword":     "new-secure-password",
	})
	if changeResp.StatusCode != http.StatusNoContent {
		t.Fatalf("change password status = %d, want %d", changeResp.StatusCode, http.StatusNoContent)
	}
	_ = changeResp.Body.Close()

	currentRefresh := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/refresh", "", nil)
	if currentRefresh.StatusCode != http.StatusOK {
		t.Fatalf("current device refresh status = %d, want %d", currentRefresh.StatusCode, http.StatusOK)
	}
	_ = currentRefresh.Body.Close()

	revokedRefresh := jsonRequest(t, secondDevice, http.MethodPost, serverURL.URL+"/api/auth/refresh", "", nil)
	if revokedRefresh.StatusCode != http.StatusUnauthorized {
		t.Fatalf("other device refresh status = %d, want %d", revokedRefresh.StatusCode, http.StatusUnauthorized)
	}
	_ = revokedRefresh.Body.Close()

	oldLogin := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/login", "", map[string]any{
		"username": "password-owner",
		"password": "secure-password",
	})
	if oldLogin.StatusCode != http.StatusUnauthorized {
		t.Fatalf("old-password login status = %d, want %d", oldLogin.StatusCode, http.StatusUnauthorized)
	}
	_ = oldLogin.Body.Close()

	newLogin := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/login", "", map[string]any{
		"username": "password-owner",
		"password": "new-secure-password",
	})
	if newLogin.StatusCode != http.StatusOK {
		t.Fatalf("new-password login status = %d, want %d", newLogin.StatusCode, http.StatusOK)
	}
	_ = newLogin.Body.Close()
}

func resetTestRuntime(t *testing.T, databaseURL, redisURL string) {
	t.Helper()

	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	defer db.Close()
	if _, err := db.Exec(`DROP SCHEMA IF EXISTS public CASCADE`); err != nil {
		t.Fatalf("drop public schema: %v", err)
	}
	if _, err := db.Exec(`CREATE SCHEMA public`); err != nil {
		t.Fatalf("create public schema: %v", err)
	}
	applyTestSchema(t, db)

	redisOptions, err := redis.ParseURL(redisURL)
	if err != nil {
		t.Fatalf("parse redis url: %v", err)
	}
	client := redis.NewClient(redisOptions)
	defer client.Close()
	if err := client.FlushDB(context.Background()).Err(); err != nil {
		t.Fatalf("flush redis: %v", err)
	}
}

func applyTestSchema(t *testing.T, db *sql.DB) {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	backendRoot := filepath.Join(filepath.Dir(thisFile), "..", "..")
	candidates := []string{
		filepath.Join(backendRoot, "migrations", "20260804120000_baseline.sql"),
		filepath.Join(backendRoot, "testdata", "schema", "current.sql"),
	}
	var schemaPath string
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			schemaPath = candidate
			break
		}
	}
	if schemaPath == "" {
		t.Fatal("no schema fixture found (testdata/schema/current.sql or migrations baseline)")
	}
	raw, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("read schema fixture %s: %v", schemaPath, err)
	}
	if err := execSchemaSQL(db, string(raw)); err != nil {
		t.Fatalf("apply schema from %s: %v", schemaPath, err)
	}

	migrationsDir := filepath.Join(backendRoot, "migrations")
	entries, err := os.ReadDir(migrationsDir)
	if err == nil {
		sort.Slice(entries, func(i, j int) bool {
			return entries[i].Name() < entries[j].Name()
		})
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
				continue
			}
			if entry.Name() == "20260804120000_baseline.sql" {
				continue
			}
			migPath := filepath.Join(migrationsDir, entry.Name())
			migRaw, err := os.ReadFile(migPath)
			if err != nil {
				t.Fatalf("read migration fixture %s: %v", migPath, err)
			}
			if err := execSchemaSQL(db, string(migRaw)); err != nil {
				t.Fatalf("apply migration %s: %v", entry.Name(), err)
			}
		}
	}
}

func execSchemaSQL(db *sql.DB, raw string) error {
	raw = strings.TrimPrefix(raw, "\xef\xbb\xbf")
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	raw = strings.ReplaceAll(raw, "\r", "\n")
	var cleaned strings.Builder
	for _, line := range strings.Split(raw, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, `\restrict`) || strings.HasPrefix(trimmed, `\unrestrict`) {
			continue
		}
		upper := strings.ToUpper(trimmed)
		if strings.HasPrefix(upper, "SET ") || upper == "SET" {
			continue
		}
		if strings.HasPrefix(upper, "SELECT PG_CATALOG.") {
			continue
		}
		cleaned.WriteString(line)
		cleaned.WriteByte('\n')
	}
	for _, stmt := range strings.Split(cleaned.String(), ";\n") {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" || schemaStatementIsCommentOnly(stmt) {
			continue
		}
		if _, err := db.Exec(stmt); err != nil {
			preview := stmt
			if len(preview) > 240 {
				preview = preview[:240] + "…"
			}
			return fmt.Errorf("%w\nstatement: %s", err, preview)
		}
	}
	return nil
}

func schemaStatementIsCommentOnly(stmt string) bool {
	for _, line := range strings.Split(stmt, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "--") {
			continue
		}
		return false
	}
	return true
}

func jsonRequest(t *testing.T, client *http.Client, method, target string, token string, body any) *http.Response {
	t.Helper()
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request: %v", err)
		}
		reader = bytes.NewReader(payload)
	}
	req, err := http.NewRequest(method, target, reader)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	return resp
}

func decodeJSON[T any](t *testing.T, resp *http.Response) T {
	t.Helper()
	defer resp.Body.Close()
	var payload T
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return payload
}

func TestFamilyMinimizedChatLayout(t *testing.T) {
	_, serverURL, client := newTestServer(t)
	setupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Layout Family",
		"username":    "layout-owner",
		"password":    "secure-password",
		"displayName": "Layout Owner",
	})
	if setupResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup status = %d", setupResp.StatusCode)
	}
	owner := decodeJSON[authResponse](t, setupResp)

	updateResp := jsonRequest(t, client, http.MethodPatch, serverURL.URL+"/api/family", owner.AccessToken, map[string]any{
		"minimizedChatLayout": true,
	})
	if updateResp.StatusCode != http.StatusOK {
		t.Fatalf("update family status = %d", updateResp.StatusCode)
	}
	updated := decodeJSON[familyPublic](t, updateResp)
	if !updated.MinimizedChatLayout {
		t.Fatal("expected minimized chat layout to be enabled")
	}

	getResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/family", owner.AccessToken, nil)
	if getResp.StatusCode != http.StatusOK {
		t.Fatalf("get family status = %d", getResp.StatusCode)
	}
	if family := decodeJSON[familyPublic](t, getResp); !family.MinimizedChatLayout {
		t.Fatal("expected minimized chat layout to persist")
	}
}

func uploadFileRequest(t *testing.T, client *http.Client, target, token, chatID, filename string, data []byte) *http.Response {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	if chatID != "" {
		if err := writer.WriteField("chatId", chatID); err != nil {
			t.Fatalf("write chatId: %v", err)
		}
	}
	header := textproto.MIMEHeader{}
	header.Set("Content-Disposition", `form-data; name="file"; filename="`+filename+`"`)
	contentType := mime.TypeByExtension(filepath.Ext(filename))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	header.Set("Content-Type", contentType)
	part, err := writer.CreatePart(header)
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatalf("write file data: %v", err)
	}
	_ = writer.Close()

	req, err := http.NewRequest(http.MethodPost, target, body)
	if err != nil {
		t.Fatalf("new upload request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("do upload: %v", err)
	}
	return resp
}

func mediaPlaybackRequest(t *testing.T, client *http.Client, method, target, token, byteRange, ifModifiedSince string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(method, target, nil)
	if err != nil {
		t.Fatalf("new media playback request: %v", err)
	}
	if token != "" {
		req.Header.Set(mediaPlaybackTokenHeader, token)
	}
	if byteRange != "" {
		req.Header.Set("Range", byteRange)
	}
	if ifModifiedSince != "" {
		req.Header.Set("If-Modified-Since", ifModifiedSince)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("do media playback request: %v", err)
	}
	return resp
}

func TestAddExistingServerMemberToChat(t *testing.T) {
	server, httpServer, client := newTestServer(t)
	defer httpServer.Close()
	defer server.Close()

	owner := setupOwner(t, client, httpServer.URL, "chat-owner", "Chat Family")
	member := createInvitedUser(t, client, httpServer.URL, owner, "chat-member")
	personToAdd := createInvitedUser(t, client, httpServer.URL, owner, "chat-person-to-add")

	createResp := jsonRequest(t, client, http.MethodPost, httpServer.URL+"/api/chats/group", owner.AccessToken, map[string]any{
		"title":     "Weekend plans",
		"memberIds": []string{member.User.ID},
	})
	if createResp.StatusCode != http.StatusCreated {
		t.Fatalf("create group status = %d", createResp.StatusCode)
	}
	chat := decodeJSON[chatPublic](t, createResp)

	addResp := jsonRequest(t, client, http.MethodPost, httpServer.URL+"/api/chats/"+chat.ID+"/members", owner.AccessToken, map[string]any{
		"userIds": []string{personToAdd.User.ID},
	})
	if addResp.StatusCode != http.StatusOK {
		t.Fatalf("add chat member status = %d body=%s", addResp.StatusCode, readBody(t, addResp))
	}
	updated := decodeJSON[chatPublic](t, addResp)
	foundAddedPerson := false
	for _, candidate := range updated.Members {
		if candidate.ID == personToAdd.User.ID {
			foundAddedPerson = true
			break
		}
	}
	if !foundAddedPerson {
		t.Fatalf("added person is missing from chat members: %#v", updated.Members)
	}

	visibleToAddedPerson := jsonRequest(t, client, http.MethodGet, httpServer.URL+"/api/chats/"+chat.ID, personToAdd.AccessToken, nil)
	if visibleToAddedPerson.StatusCode != http.StatusOK {
		t.Fatalf("added person chat access status = %d", visibleToAddedPerson.StatusCode)
	}
	_ = visibleToAddedPerson.Body.Close()
}

func createInvitedUser(t *testing.T, ownerClient *http.Client, serverURL string, owner authResponse, username string) authResponse {
	t.Helper()
	inviteResp := jsonRequest(t, ownerClient, http.MethodPost, serverURL+"/api/invites", owner.AccessToken, map[string]any{
		"role":           "member",
		"expiresInHours": 48,
		"maxUses":        1,
	})
	if inviteResp.StatusCode != http.StatusCreated {
		t.Fatalf("invite status = %d", inviteResp.StatusCode)
	}
	invite := decodeJSON[createInviteResponse](t, inviteResp)
	parsedInvite, err := url.Parse(invite.InviteURL)
	if err != nil {
		t.Fatalf("parse invite URL: %v", err)
	}
	token := strings.TrimPrefix(parsedInvite.Path, "/invite/")
	memberJar, _ := cookiejar.New(nil)
	memberClient := &http.Client{Jar: memberJar}
	resp := jsonRequest(t, memberClient, http.MethodPost, serverURL+"/api/invites/"+token+"/accept", "", map[string]any{
		"username":    username,
		"password":    "secure-password",
		"displayName": strings.Title(username),
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("accept invite status = %d", resp.StatusCode)
	}
	return decodeJSON[authResponse](t, resp)
}

type mediaPlaybackFixture struct {
	server     *Server
	httpServer *httptest.Server
	client     *http.Client
	owner      authResponse
	member     authResponse
	observer   authResponse
	chat       chatPublic
	file       filePublic
	data       []byte
}

func newMediaPlaybackFixture(t *testing.T) mediaPlaybackFixture {
	t.Helper()
	server, httpServer, client := newTestServer(t)
	setupResp := jsonRequest(t, client, http.MethodPost, httpServer.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Playback Family",
		"username":    "playback-owner",
		"password":    "secure-password",
		"displayName": "Playback Owner",
	})
	if setupResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup status = %d", setupResp.StatusCode)
	}
	owner := decodeJSON[authResponse](t, setupResp)
	member := createInvitedUser(t, client, httpServer.URL, owner, "playback-member")
	observer := createInvitedUser(t, client, httpServer.URL, owner, "playback-observer")

	chatResp := jsonRequest(t, client, http.MethodPost, httpServer.URL+"/api/chats/direct", owner.AccessToken, map[string]any{
		"userId": member.User.ID,
	})
	if chatResp.StatusCode != http.StatusCreated {
		t.Fatalf("create playback chat status = %d", chatResp.StatusCode)
	}
	chat := decodeJSON[chatPublic](t, chatResp)
	data := []byte("0123456789abcdef")
	uploadResp := uploadFileRequest(t, client, httpServer.URL+"/api/files/upload", owner.AccessToken, chat.ID, "track.mp3", data)
	if uploadResp.StatusCode != http.StatusCreated {
		t.Fatalf("upload playback audio status = %d", uploadResp.StatusCode)
	}
	file := decodeJSON[filePublic](t, uploadResp)

	return mediaPlaybackFixture{
		server: server, httpServer: httpServer, client: client,
		owner: owner, member: member, observer: observer,
		chat: chat, file: file, data: data,
	}
}

func TestMediaPlaybackFullRangeHeadAndConditionalResponses(t *testing.T) {
	fixture := newMediaPlaybackFixture(t)
	mintResp := jsonRequest(t, fixture.client, http.MethodPost, fixture.httpServer.URL+"/api/files/"+fixture.file.ID+"/playback-token", fixture.owner.AccessToken, nil)
	if mintResp.StatusCode != http.StatusOK {
		t.Fatalf("mint playback token status = %d", mintResp.StatusCode)
	}
	capability := decodeJSON[mediaPlaybackTokenResponse](t, mintResp)
	if capability.Token == "" {
		t.Fatal("mint response token is empty")
	}
	if !capability.ExpiresAt.After(time.Now()) {
		t.Fatalf("mint response expiry is not in the future: %s", capability.ExpiresAt)
	}

	mediaURL := fixture.httpServer.URL + "/api/media/" + fixture.file.ID
	fullResp := mediaPlaybackRequest(t, fixture.client, http.MethodGet, mediaURL, capability.Token, "", "")
	fullBody, err := io.ReadAll(fullResp.Body)
	fullResp.Body.Close()
	if err != nil {
		t.Fatalf("read full media body: %v", err)
	}
	if fullResp.StatusCode != http.StatusOK || !bytes.Equal(fullBody, fixture.data) {
		t.Fatalf("full media response status/body = %d/%q", fullResp.StatusCode, fullBody)
	}
	if got := fullResp.Header.Get("Content-Type"); got != fixture.file.MimeType {
		t.Fatalf("content type = %q, want %q", got, fixture.file.MimeType)
	}
	if got := fullResp.Header.Get("Content-Disposition"); got != "inline" {
		t.Fatalf("content disposition = %q, want inline", got)
	}
	if got := fullResp.Header.Get("Content-Length"); got != "16" {
		t.Fatalf("content length = %q, want 16", got)
	}
	if got := fullResp.Header.Get("Accept-Ranges"); got != "bytes" {
		t.Fatalf("accept ranges = %q, want bytes", got)
	}
	lastModified := fullResp.Header.Get("Last-Modified")
	if lastModified == "" {
		t.Fatal("last-modified header is empty")
	}

	rangeResp := mediaPlaybackRequest(t, fixture.client, http.MethodGet, mediaURL, capability.Token, "bytes=2-5", "")
	rangeBody, err := io.ReadAll(rangeResp.Body)
	rangeResp.Body.Close()
	if err != nil {
		t.Fatalf("read range body: %v", err)
	}
	if rangeResp.StatusCode != http.StatusPartialContent || string(rangeBody) != "2345" {
		t.Fatalf("range response status/body = %d/%q", rangeResp.StatusCode, rangeBody)
	}
	if got := rangeResp.Header.Get("Content-Range"); got != "bytes 2-5/16" {
		t.Fatalf("content range = %q", got)
	}
	if got := rangeResp.Header.Get("Accept-Ranges"); got != "bytes" {
		t.Fatalf("range accept ranges = %q", got)
	}

	headResp := mediaPlaybackRequest(t, fixture.client, http.MethodHead, mediaURL, capability.Token, "", "")
	headBody, err := io.ReadAll(headResp.Body)
	headResp.Body.Close()
	if err != nil {
		t.Fatalf("read HEAD body: %v", err)
	}
	if headResp.StatusCode != http.StatusOK || len(headBody) != 0 {
		t.Fatalf("HEAD response status/body length = %d/%d", headResp.StatusCode, len(headBody))
	}
	if headResp.Header.Get("Content-Length") != "16" || headResp.Header.Get("Accept-Ranges") != "bytes" {
		t.Fatalf("HEAD headers length/ranges = %q/%q", headResp.Header.Get("Content-Length"), headResp.Header.Get("Accept-Ranges"))
	}

	conditionalResp := mediaPlaybackRequest(t, fixture.client, http.MethodGet, mediaURL, capability.Token, "", lastModified)
	conditionalBody, err := io.ReadAll(conditionalResp.Body)
	conditionalResp.Body.Close()
	if err != nil {
		t.Fatalf("read conditional body: %v", err)
	}
	if conditionalResp.StatusCode != http.StatusNotModified || len(conditionalBody) != 0 {
		t.Fatalf("conditional response status/body length = %d/%d", conditionalResp.StatusCode, len(conditionalBody))
	}

	for _, byteRange := range []string{"bytes=99-100", "bytes=not-a-range"} {
		resp := mediaPlaybackRequest(t, fixture.client, http.MethodGet, mediaURL, capability.Token, byteRange, "")
		_, _ = io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		if resp.StatusCode != http.StatusRequestedRangeNotSatisfiable {
			t.Fatalf("range %q status = %d, want 416", byteRange, resp.StatusCode)
		}
	}

	_, objectKey, err := fixture.server.loadFileRecord(context.Background(), fixture.file.ID, fixture.owner.User.ID)
	if err != nil {
		t.Fatalf("load playback object key: %v", err)
	}
	if err := fixture.server.storage.Delete(objectKey); err != nil {
		t.Fatalf("delete media after responses (handle leak): %v", err)
	}
}

func TestMediaPlaybackAuthorizationFailuresAreUniform(t *testing.T) {
	fixture := newMediaPlaybackFixture(t)
	mediaURL := fixture.httpServer.URL + "/api/media/" + fixture.file.ID

	missingResp := mediaPlaybackRequest(t, fixture.client, http.MethodGet, mediaURL, "", "", "")
	wantBody, err := io.ReadAll(missingResp.Body)
	missingResp.Body.Close()
	if err != nil {
		t.Fatalf("read missing-token body: %v", err)
	}
	if missingResp.StatusCode != http.StatusNotFound {
		t.Fatalf("missing-token status = %d", missingResp.StatusCode)
	}

	valid, _, err := fixture.server.mintMediaPlaybackToken(fixture.owner.User.ID, fixture.owner.User.FamilyID, fixture.file.ID)
	if err != nil {
		t.Fatalf("mint valid playback token: %v", err)
	}
	expired := signedMediaPlaybackTokenForTest(t, fixture.server.cfg.JWTSecret, mediaPlaybackClaimsForTest(
		fixture.owner.User.ID, fixture.owner.User.FamilyID, fixture.file.ID, mediaPlaybackTokenType, mediaPlaybackTokenAudience, time.Now().Add(-time.Minute),
	), jwt.SigningMethodHS256)
	wrongFile, _, err := fixture.server.mintMediaPlaybackToken(fixture.owner.User.ID, fixture.owner.User.FamilyID, "another-file")
	if err != nil {
		t.Fatalf("mint wrong-file playback token: %v", err)
	}
	wrongFamily, _, err := fixture.server.mintMediaPlaybackToken(fixture.owner.User.ID, "another-family", fixture.file.ID)
	if err != nil {
		t.Fatalf("mint wrong-family playback token: %v", err)
	}

	for name, raw := range map[string]string{
		"malformed":    "not-a-token",
		"expired":      expired,
		"wrong file":   wrongFile,
		"wrong family": wrongFamily,
	} {
		t.Run(name, func(t *testing.T) {
			resp := mediaPlaybackRequest(t, fixture.client, http.MethodGet, mediaURL, raw, "", "")
			body, readErr := io.ReadAll(resp.Body)
			resp.Body.Close()
			if readErr != nil {
				t.Fatalf("read denial body: %v", readErr)
			}
			if resp.StatusCode != http.StatusNotFound || !bytes.Equal(body, wantBody) {
				t.Fatalf("denial status/body = %d/%q, want 404/%q", resp.StatusCode, body, wantBody)
			}
		})
	}

	nonAudioResp := uploadFileRequest(t, fixture.client, fixture.httpServer.URL+"/api/files/upload", fixture.owner.AccessToken, "", "notes.txt", []byte("notes"))
	if nonAudioResp.StatusCode != http.StatusCreated {
		t.Fatalf("upload non-audio status = %d", nonAudioResp.StatusCode)
	}
	nonAudio := decodeJSON[filePublic](t, nonAudioResp)
	for name, target := range map[string]string{
		"non-audio":   fixture.httpServer.URL + "/api/files/" + nonAudio.ID + "/playback-token",
		"invisible":   fixture.httpServer.URL + "/api/files/" + fixture.file.ID + "/playback-token",
		"nonexistent": fixture.httpServer.URL + "/api/files/missing/playback-token",
	} {
		t.Run("mint "+name, func(t *testing.T) {
			token := fixture.owner.AccessToken
			if name == "invisible" {
				token = fixture.observer.AccessToken
			}
			resp := jsonRequest(t, fixture.client, http.MethodPost, target, token, nil)
			body, readErr := io.ReadAll(resp.Body)
			resp.Body.Close()
			if readErr != nil {
				t.Fatalf("read mint denial body: %v", readErr)
			}
			if resp.StatusCode != http.StatusNotFound || !bytes.Equal(body, wantBody) {
				t.Fatalf("mint denial status/body = %d/%q, want 404/%q", resp.StatusCode, body, wantBody)
			}
		})
	}

	if err := testPersistenceStore(t, fixture.server).SoftDeleteFile(context.Background(), nil, fixture.file.ID, nowString()); err != nil {
		t.Fatalf("mark playback file deleted: %v", err)
	}
	deletedResp := mediaPlaybackRequest(t, fixture.client, http.MethodGet, mediaURL, valid, "", "")
	deletedBody, err := io.ReadAll(deletedResp.Body)
	deletedResp.Body.Close()
	if err != nil {
		t.Fatalf("read deleted denial body: %v", err)
	}
	if deletedResp.StatusCode != http.StatusNotFound || !bytes.Equal(deletedBody, wantBody) {
		t.Fatalf("deleted denial status/body = %d/%q, want 404/%q", deletedResp.StatusCode, deletedBody, wantBody)
	}
}

func TestMediaPlaybackVisibilityRevocationAfterMint(t *testing.T) {
	fixture := newMediaPlaybackFixture(t)
	mintResp := jsonRequest(t, fixture.client, http.MethodPost, fixture.httpServer.URL+"/api/files/"+fixture.file.ID+"/playback-token", fixture.member.AccessToken, nil)
	if mintResp.StatusCode != http.StatusOK {
		t.Fatalf("member mint status = %d", mintResp.StatusCode)
	}
	capability := decodeJSON[mediaPlaybackTokenResponse](t, mintResp)
	if _, err := testPersistenceClient(t, fixture.server).ChatMember.Delete().
		Where(
			chatmember.IDEQ(fixture.chat.ID),
			chatmember.UserIDEQ(fixture.member.User.ID),
		).
		Exec(context.Background()); err != nil {
		t.Fatalf("remove member after mint: %v", err)
	}
	resp := mediaPlaybackRequest(t, fixture.client, http.MethodGet, fixture.httpServer.URL+"/api/media/"+fixture.file.ID, capability.Token, "", "")
	body, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		t.Fatalf("read revoked visibility body: %v", err)
	}
	if resp.StatusCode != http.StatusNotFound || len(body) == 0 {
		t.Fatalf("revoked visibility status/body = %d/%q", resp.StatusCode, body)
	}
}

func TestLocalStorageOpenIsSeekableAndRejectsTraversal(t *testing.T) {
	store, err := storage.NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatalf("new local storage: %v", err)
	}
	if err := store.Save("audio/track.mp3", []byte("0123456789")); err != nil {
		t.Fatalf("save local object: %v", err)
	}
	handle, err := store.Open("audio/track.mp3")
	if err != nil {
		t.Fatalf("open local object: %v", err)
	}
	buf := make([]byte, 3)
	if _, err := handle.Read(buf); err != nil || string(buf) != "012" {
		t.Fatalf("first read = %q, err=%v", buf, err)
	}
	if _, err := handle.Seek(5, io.SeekStart); err != nil {
		t.Fatalf("seek local object: %v", err)
	}
	if _, err := handle.Read(buf); err != nil || string(buf) != "567" {
		t.Fatalf("read after seek = %q, err=%v", buf, err)
	}
	if err := handle.Close(); err != nil {
		t.Fatalf("close local object: %v", err)
	}
	if _, err := store.Open("../outside.mp3"); err == nil {
		t.Fatal("expected traversal open to fail")
	}
}

func TestSetupInviteChatAndRefreshFlow(t *testing.T) {
	_, serverURL, client := newTestServer(t)

	setupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"nickname": "Owner",
		"password": "secure-password",
	})
	if setupResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup status = %d", setupResp.StatusCode)
	}
	owner := decodeJSON[authResponse](t, setupResp)
	userJSON, err := json.Marshal(owner.User)
	if err != nil {
		t.Fatalf("marshal setup user: %v", err)
	}
	if strings.Contains(strings.ToLower(string(userJSON)), "email") {
		t.Fatalf("setup user exposes email: %s", userJSON)
	}
	if owner.User.Username != "Owner" || owner.User.DisplayName != "Owner" {
		t.Fatalf("unexpected minimal setup user: %#v", owner.User)
	}

	parsedURL, _ := url.Parse(serverURL.URL + "/api/auth/refresh")
	cookies := client.Jar.Cookies(parsedURL)
	if len(cookies) == 0 || cookies[0].Name != "family_refresh_token" {
		t.Fatalf("expected refresh cookie after setup")
	}
	oldRefresh := cookies[0].Value

	refreshResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/refresh", "", nil)
	if refreshResp.StatusCode != http.StatusOK {
		t.Fatalf("refresh status = %d", refreshResp.StatusCode)
	}
	_ = decodeJSON[authResponse](t, refreshResp)
	newCookies := client.Jar.Cookies(parsedURL)
	if len(newCookies) == 0 || newCookies[0].Value == oldRefresh {
		t.Fatalf("expected rotated refresh cookie")
	}

	inviteResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/invites", owner.AccessToken, map[string]any{
		"role":           "member",
		"expiresInHours": 48,
		"maxUses":        1,
	})
	if inviteResp.StatusCode != http.StatusCreated {
		t.Fatalf("invite status = %d", inviteResp.StatusCode)
	}
	invite := decodeJSON[createInviteResponse](t, inviteResp)
	token := invite.InviteURL[strings.LastIndex(invite.InviteURL, "/")+1:]

	memberClientJar, _ := cookiejar.New(nil)
	memberClient := &http.Client{Jar: memberClientJar}
	acceptResp := jsonRequest(t, memberClient, http.MethodPost, serverURL.URL+"/api/invites/"+token+"/accept", "", map[string]any{
		"nickname": "Member",
		"password": "secure-password",
	})
	if acceptResp.StatusCode != http.StatusCreated {
		t.Fatalf("accept status = %d", acceptResp.StatusCode)
	}
	member := decodeJSON[authResponse](t, acceptResp)
	if member.User.Username != "Member" || member.User.DisplayName != "Member" {
		t.Fatalf("unexpected minimal invite user: %#v", member.User)
	}

	chatResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/direct", owner.AccessToken, map[string]any{
		"userId": member.User.ID,
	})
	if chatResp.StatusCode != http.StatusCreated {
		t.Fatalf("create direct chat status = %d", chatResp.StatusCode)
	}
	chat := decodeJSON[chatPublic](t, chatResp)

	messageResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/"+chat.ID+"/messages", owner.AccessToken, map[string]any{
		"type":    "text",
		"content": "Hello there",
	})
	if messageResp.StatusCode != http.StatusCreated {
		t.Fatalf("send message status = %d", messageResp.StatusCode)
	}
	message := decodeJSON[messagePublic](t, messageResp)
	if message.Content == nil || *message.Content != "Hello there" {
		t.Fatalf("unexpected message content: %#v", message.Content)
	}

	memberChatsResp := jsonRequest(t, memberClient, http.MethodGet, serverURL.URL+"/api/chats", member.AccessToken, nil)
	if memberChatsResp.StatusCode != http.StatusOK {
		t.Fatalf("member chats status = %d", memberChatsResp.StatusCode)
	}
	memberChats := decodeJSON[[]chatPublic](t, memberChatsResp)
	if len(memberChats) == 0 || memberChats[0].UnreadCount == 0 {
		t.Fatalf("expected unread message for member")
	}

	readResp := jsonRequest(t, memberClient, http.MethodPatch, serverURL.URL+"/api/messages/"+message.ID+"/read", member.AccessToken, nil)
	if readResp.StatusCode != http.StatusOK {
		t.Fatalf("mark read status = %d", readResp.StatusCode)
	}

	logoutResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/logout", "", nil)
	if logoutResp.StatusCode != http.StatusOK {
		t.Fatalf("logout status = %d", logoutResp.StatusCode)
	}
	postLogoutRefresh := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/refresh", "", nil)
	if postLogoutRefresh.StatusCode != http.StatusUnauthorized {
		t.Fatalf("post logout refresh status = %d", postLogoutRefresh.StatusCode)
	}
}

func TestDirectMediaVisibilityAndPublicAccess(t *testing.T) {
	_, serverURL, client := newTestServer(t)

	setupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Files Family",
		"username":    "owner",
		"password":    "secure-password",
		"displayName": "Owner",
	})
	owner := decodeJSON[authResponse](t, setupResp)

	member := createInvitedUser(t, client, serverURL.URL, owner, "member")
	observer := createInvitedUser(t, client, serverURL.URL, owner, "observer")

	chatResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/direct", owner.AccessToken, map[string]any{
		"userId": member.User.ID,
	})
	chat := decodeJSON[chatPublic](t, chatResp)

	uploadResp := uploadFileRequest(t, client, serverURL.URL+"/api/files/upload", owner.AccessToken, chat.ID, "photo.jpg", []byte("image-bytes"))
	if uploadResp.StatusCode != http.StatusCreated {
		t.Fatalf("upload status = %d", uploadResp.StatusCode)
	}
	file := decodeJSON[filePublic](t, uploadResp)
	if file.AccessScope != "chat" {
		t.Fatalf("expected chat scoped file")
	}

	observerResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/files/"+file.ID+"/download", observer.AccessToken, nil)
	if observerResp.StatusCode != http.StatusNotFound {
		t.Fatalf("observer initial download status = %d", observerResp.StatusCode)
	}

	firstApproval := jsonRequest(t, client, http.MethodPatch, serverURL.URL+"/api/chats/"+chat.ID, owner.AccessToken, map[string]any{
		"mediaVisibility": "family",
	})
	firstChat := decodeJSON[chatPublic](t, firstApproval)
	if firstChat.MediaVisibility != "members" || !firstChat.MediaVisibilityPendingApproval {
		t.Fatalf("expected pending approval after first direct approval")
	}

	secondApproval := jsonRequest(t, client, http.MethodPatch, serverURL.URL+"/api/chats/"+chat.ID, member.AccessToken, map[string]any{
		"mediaVisibility": "family",
	})
	secondChat := decodeJSON[chatPublic](t, secondApproval)
	if secondChat.MediaVisibility != "family" || secondChat.MediaVisibilityPendingApproval {
		t.Fatalf("expected family visibility after second approval")
	}

	observerAllowed := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/files/"+file.ID+"/download", observer.AccessToken, nil)
	if observerAllowed.StatusCode != http.StatusOK {
		t.Fatalf("observer download after approval status = %d", observerAllowed.StatusCode)
	}
	_ = observerAllowed.Body.Close()

	publicAccessResp := jsonRequest(t, client, http.MethodPut, serverURL.URL+"/api/admin/public-access", owner.AccessToken, map[string]any{
		"appUrl": "https://family-chat.example.com/",
		"apiUrl": "https://family-api.example.com/",
	})
	if publicAccessResp.StatusCode != http.StatusOK {
		t.Fatalf("public access update status = %d", publicAccessResp.StatusCode)
	}
	settings := decodeJSON[publicAccessSettings](t, publicAccessResp)
	if settings.AppURL != "https://family-chat.example.com" || settings.APIURL != "https://family-api.example.com" {
		t.Fatalf("unexpected public access settings: %#v", settings)
	}
}

func TestLoginRateLimitAndHealthChecks(t *testing.T) {
	_, serverURL, client := newTestServer(t)

	setupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Rate Limit Family",
		"username":    "owner",
		"password":    "secure-password",
		"displayName": "Owner",
	})
	if setupResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup status = %d", setupResp.StatusCode)
	}
	_ = decodeJSON[authResponse](t, setupResp)

	for attempt := 1; attempt <= 10; attempt++ {
		resp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/login", "", map[string]any{
			"login":    "owner@example.com",
			"password": "wrong-password",
		})
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("attempt %d status = %d", attempt, resp.StatusCode)
		}
		_ = resp.Body.Close()
	}

	blockedResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/login", "", map[string]any{
		"login":    "owner@example.com",
		"password": "wrong-password",
	})
	if blockedResp.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("rate limit status = %d", blockedResp.StatusCode)
	}
	_ = blockedResp.Body.Close()

	dbHealthResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/health/db", "", nil)
	if dbHealthResp.StatusCode != http.StatusOK {
		t.Fatalf("db health status = %d", dbHealthResp.StatusCode)
	}
	_ = dbHealthResp.Body.Close()

	redisHealthResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/health/redis", "", nil)
	if redisHealthResp.StatusCode != http.StatusOK {
		t.Fatalf("redis health status = %d", redisHealthResp.StatusCode)
	}
	_ = redisHealthResp.Body.Close()
}

func TestChatAndFilePreferencesArePerUser(t *testing.T) {
	_, serverURL, client := newTestServer(t)

	setupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Preferences Family",
		"username":    "owner",
		"password":    "secure-password",
		"displayName": "Owner",
	})
	if setupResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup status = %d", setupResp.StatusCode)
	}
	owner := decodeJSON[authResponse](t, setupResp)
	member := createInvitedUser(t, client, serverURL.URL, owner, "member")

	chatResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/direct", owner.AccessToken, map[string]any{
		"userId": member.User.ID,
	})
	if chatResp.StatusCode != http.StatusCreated {
		t.Fatalf("create direct chat status = %d", chatResp.StatusCode)
	}
	chat := decodeJSON[chatPublic](t, chatResp)

	memberPrefResp := jsonRequest(t, client, http.MethodPatch, serverURL.URL+"/api/chats/"+chat.ID+"/preferences", member.AccessToken, map[string]any{
		"isPinned":   true,
		"isFavorite": true,
	})
	if memberPrefResp.StatusCode != http.StatusOK {
		t.Fatalf("member chat preferences status = %d", memberPrefResp.StatusCode)
	}
	memberChat := decodeJSON[chatPublic](t, memberPrefResp)
	if !memberChat.IsPinned || !memberChat.IsFavorite {
		t.Fatalf("expected member preferences to be saved")
	}

	ownerChatResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/chats/"+chat.ID, owner.AccessToken, nil)
	if ownerChatResp.StatusCode != http.StatusOK {
		t.Fatalf("owner chat status = %d", ownerChatResp.StatusCode)
	}
	ownerChat := decodeJSON[chatPublic](t, ownerChatResp)
	if ownerChat.IsPinned || ownerChat.IsFavorite {
		t.Fatalf("owner chat preferences should remain unchanged")
	}

	uploadResp := uploadFileRequest(t, client, serverURL.URL+"/api/files/upload", owner.AccessToken, "", "photo.jpg", []byte("family-photo"))
	if uploadResp.StatusCode != http.StatusCreated {
		t.Fatalf("upload status = %d", uploadResp.StatusCode)
	}
	file := decodeJSON[filePublic](t, uploadResp)

	ownerFavoriteResp := jsonRequest(t, client, http.MethodPatch, serverURL.URL+"/api/files/"+file.ID+"/preferences", owner.AccessToken, map[string]any{
		"isFavorite": true,
	})
	if ownerFavoriteResp.StatusCode != http.StatusOK {
		t.Fatalf("owner file preference status = %d", ownerFavoriteResp.StatusCode)
	}
	ownerFile := decodeJSON[filePublic](t, ownerFavoriteResp)
	if !ownerFile.IsFavorite {
		t.Fatalf("owner file favorite should be true")
	}

	memberFileResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/files/"+file.ID, member.AccessToken, nil)
	if memberFileResp.StatusCode != http.StatusOK {
		t.Fatalf("member file status = %d", memberFileResp.StatusCode)
	}
	memberFile := decodeJSON[filePublic](t, memberFileResp)
	if memberFile.IsFavorite {
		t.Fatalf("member file favorite should default to false")
	}
}

func TestAuthContractEdgeCases(t *testing.T) {
	server, serverURL, client := newTestServer(t)

	healthResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/health", "", nil)
	if healthResp.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d", healthResp.StatusCode)
	}
	health := decodeJSON[map[string]any](t, healthResp)
	if health["status"] != "ok" || health["service"] != server.cfg.AppName || health["environment"] != server.cfg.AppEnv || health["version"] != server.cfg.AppVersion {
		t.Fatalf("unexpected health payload: %#v", health)
	}

	setupStatusResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/auth/setup-status", "", nil)
	if setupStatusResp.StatusCode != http.StatusOK {
		t.Fatalf("setup status before setup = %d", setupStatusResp.StatusCode)
	}
	setupStatus := decodeJSON[setupStatusResponse](t, setupStatusResp)
	if !setupStatus.SetupRequired || setupStatus.SetupComplete {
		t.Fatalf("unexpected initial setup status: %#v", setupStatus)
	}

	setupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Auth Family",
		"username":    "owner",
		"password":    "secure-password",
		"displayName": "Owner",
	})
	if setupResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup status = %d", setupResp.StatusCode)
	}
	owner := decodeJSON[authResponse](t, setupResp)

	setupStatusResp = jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/auth/setup-status", "", nil)
	setupStatus = decodeJSON[setupStatusResponse](t, setupStatusResp)
	if setupStatus.SetupRequired || !setupStatus.SetupComplete {
		t.Fatalf("unexpected post-setup status: %#v", setupStatus)
	}

	secondSetupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Other",
		"username":    "other",
		"password":    "secure-password",
		"displayName": "Other",
	})
	if secondSetupResp.StatusCode != http.StatusConflict {
		t.Fatalf("second setup status = %d", secondSetupResp.StatusCode)
	}
	_ = secondSetupResp.Body.Close()

	usernameLoginResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/login", "", map[string]any{
		"username": "owner",
		"password": "secure-password",
	})
	if usernameLoginResp.StatusCode != http.StatusOK {
		t.Fatalf("username login status = %d", usernameLoginResp.StatusCode)
	}
	_ = decodeJSON[authResponse](t, usernameLoginResp)

	emailLoginResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/login", "", map[string]any{
		"username": "owner@example.com",
		"password": "secure-password",
	})
	if emailLoginResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("email login status = %d", emailLoginResp.StatusCode)
	}
	_ = emailLoginResp.Body.Close()

	refreshURL, _ := url.Parse(serverURL.URL + "/api/auth/refresh")
	refreshCookie := client.Jar.Cookies(refreshURL)[0].Value
	refreshResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/refresh", "", nil)
	if refreshResp.StatusCode != http.StatusOK {
		t.Fatalf("refresh status = %d", refreshResp.StatusCode)
	}
	_ = decodeJSON[authResponse](t, refreshResp)
	client.Jar.SetCookies(refreshURL, []*http.Cookie{{Name: "family_refresh_token", Value: refreshCookie, Path: "/api/auth"}})
	replayResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/refresh", "", nil)
	if replayResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("replay refresh status = %d", replayResp.StatusCode)
	}
	_ = replayResp.Body.Close()

	inviteResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/invites", owner.AccessToken, map[string]any{
		"role":           "member",
		"expiresInHours": 48,
		"maxUses":        1,
	})
	if inviteResp.StatusCode != http.StatusCreated {
		t.Fatalf("invite status = %d", inviteResp.StatusCode)
	}
	invite := decodeJSON[createInviteResponse](t, inviteResp)
	token := invite.InviteURL[strings.LastIndex(invite.InviteURL, "/")+1:]

	duplicateAcceptResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/invites/"+token+"/accept", "", map[string]any{
		"username":    "owner",
		"password":    "secure-password",
		"displayName": "New Member",
	})
	if duplicateAcceptResp.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate accept status = %d", duplicateAcceptResp.StatusCode)
	}
	_ = duplicateAcceptResp.Body.Close()

	acceptedResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/invites/"+token+"/accept", "", map[string]any{
		"username":    "accepted-member",
		"password":    "secure-password",
		"displayName": "Accepted Member",
	})
	if acceptedResp.StatusCode != http.StatusCreated {
		t.Fatalf("accept invite status = %d", acceptedResp.StatusCode)
	}
	member := decodeJSON[authResponse](t, acceptedResp)
	if member.User.Role != "member" {
		t.Fatalf("unexpected accepted role = %s", member.User.Role)
	}

	exhaustedAcceptResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/invites/"+token+"/accept", "", map[string]any{
		"username":    "other-member",
		"password":    "secure-password",
		"displayName": "Other Member",
	})
	if exhaustedAcceptResp.StatusCode != http.StatusNotFound {
		t.Fatalf("exhausted invite status = %d", exhaustedAcceptResp.StatusCode)
	}
	_ = exhaustedAcceptResp.Body.Close()
}

func TestUsersSchemaPermanentlyErasesEmailColumn(t *testing.T) {
	server, _, _ := newTestServer(t)
	db, ok := server.database.(*sql.DB)
	if !ok {
		t.Fatal("integration fixture did not retain a SQL database")
	}

	var count int
	if err := db.QueryRow(`
		SELECT COUNT(*)
		FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'email'
	`).Scan(&count); err != nil {
		t.Fatalf("inspect users columns: %v", err)
	}
	if count != 0 {
		t.Fatalf("users.email column still exists after migrated schema apply")
	}
}

func TestMessageValidationHistoryAndReadParity(t *testing.T) {
	_, serverURL, client := newTestServer(t)

	setupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Messages Family",
		"username":    "owner",
		"password":    "secure-password",
		"displayName": "Owner",
	})
	owner := decodeJSON[authResponse](t, setupResp)
	member := createInvitedUser(t, client, serverURL.URL, owner, "member")
	chatResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/direct", owner.AccessToken, map[string]any{
		"userId": member.User.ID,
	})
	chat := decodeJSON[chatPublic](t, chatResp)

	blankResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/"+chat.ID+"/messages", owner.AccessToken, map[string]any{
		"type":    "text",
		"content": "   ",
	})
	if blankResp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("blank message status = %d", blankResp.StatusCode)
	}
	_ = blankResp.Body.Close()

	tooLongResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/"+chat.ID+"/messages", owner.AccessToken, map[string]any{
		"type":    "text",
		"content": strings.Repeat("x", 4001),
	})
	if tooLongResp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("too long message status = %d", tooLongResp.StatusCode)
	}
	_ = tooLongResp.Body.Close()

	invalidTypeResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/"+chat.ID+"/messages", owner.AccessToken, map[string]any{
		"type":    "unknown",
		"content": "oops",
	})
	if invalidTypeResp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("invalid type status = %d", invalidTypeResp.StatusCode)
	}
	_ = invalidTypeResp.Body.Close()

	firstMessage := decodeJSON[messagePublic](t, jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/"+chat.ID+"/messages", owner.AccessToken, map[string]any{
		"type":    "text",
		"content": "One",
	}))
	secondMessage := decodeJSON[messagePublic](t, jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/"+chat.ID+"/messages", owner.AccessToken, map[string]any{
		"type":    "text",
		"content": "Two",
	}))

	historyResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/chats/"+chat.ID+"/messages?limit=1", member.AccessToken, nil)
	if historyResp.StatusCode != http.StatusOK {
		t.Fatalf("history limit status = %d", historyResp.StatusCode)
	}
	history := decodeJSON[messageHistoryPage](t, historyResp)
	if len(history.Messages) != 1 || history.Messages[0].ID != secondMessage.ID || history.NextBefore != secondMessage.ID || !history.HasMore {
		t.Fatalf("unexpected latest history payload: %#v", history)
	}

	paginatedResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/chats/"+chat.ID+"/messages?before="+secondMessage.ID+"&limit=10", member.AccessToken, nil)
	if paginatedResp.StatusCode != http.StatusOK {
		t.Fatalf("history before status = %d", paginatedResp.StatusCode)
	}
	paginated := decodeJSON[messageHistoryPage](t, paginatedResp)
	if len(paginated.Messages) != 1 || paginated.Messages[0].ID != firstMessage.ID || paginated.NextBefore != "" || paginated.HasMore {
		t.Fatalf("unexpected paginated history payload: %#v", paginated)
	}

	readOwnResp := jsonRequest(t, client, http.MethodPatch, serverURL.URL+"/api/messages/"+firstMessage.ID+"/read", owner.AccessToken, nil)
	if readOwnResp.StatusCode != http.StatusOK {
		t.Fatalf("read own status = %d", readOwnResp.StatusCode)
	}
	readOwn := decodeJSON[messagePublic](t, readOwnResp)
	for _, status := range readOwn.Statuses {
		if status.UserID == owner.User.ID && status.Status == "read" {
			t.Fatalf("sender should not get self read status")
		}
	}

	readMemberResp := jsonRequest(t, client, http.MethodPatch, serverURL.URL+"/api/messages/"+secondMessage.ID+"/read", member.AccessToken, nil)
	if readMemberResp.StatusCode != http.StatusOK {
		t.Fatalf("member read status = %d", readMemberResp.StatusCode)
	}
	readMember := decodeJSON[messagePublic](t, readMemberResp)
	readCount := 0
	for _, status := range readMember.Statuses {
		if status.UserID == member.User.ID && status.Status == "read" {
			readCount++
		}
	}
	if readCount != 1 {
		t.Fatalf("expected exactly one member read status, got %d", readCount)
	}

	secondReadResp := jsonRequest(t, client, http.MethodPatch, serverURL.URL+"/api/messages/"+secondMessage.ID+"/read", member.AccessToken, nil)
	if secondReadResp.StatusCode != http.StatusOK {
		t.Fatalf("second member read status = %d", secondReadResp.StatusCode)
	}
	secondRead := decodeJSON[messagePublic](t, secondReadResp)
	readCount = 0
	for _, status := range secondRead.Statuses {
		if status.UserID == member.User.ID && status.Status == "read" {
			readCount++
		}
	}
	if readCount != 1 {
		t.Fatalf("expected idempotent read status, got %d", readCount)
	}

	fileUploadResp := uploadFileRequest(t, client, serverURL.URL+"/api/files/upload", owner.AccessToken, "", "photo.jpg", []byte("notes"))
	if fileUploadResp.StatusCode != http.StatusCreated {
		t.Fatalf("file upload status = %d", fileUploadResp.StatusCode)
	}
	file := decodeJSON[filePublic](t, fileUploadResp)
	deleteResp := jsonRequest(t, client, http.MethodDelete, serverURL.URL+"/api/files/"+file.ID, owner.AccessToken, nil)
	if deleteResp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete file status = %d", deleteResp.StatusCode)
	}
	attachDeletedResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/"+chat.ID+"/messages", owner.AccessToken, map[string]any{
		"type":    "file",
		"fileIds": []string{file.ID},
	})
	if attachDeletedResp.StatusCode != http.StatusBadRequest {
		t.Fatalf("attach deleted file status = %d", attachDeletedResp.StatusCode)
	}
	_ = attachDeletedResp.Body.Close()
}

func TestGroupMediaAdminValidationAndInviteUrlParity(t *testing.T) {
	server, serverURL, client := newTestServer(t)

	setupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Admin Family",
		"username":    "owner",
		"password":    "secure-password",
		"displayName": "Owner",
	})
	owner := decodeJSON[authResponse](t, setupResp)
	member := createInvitedUser(t, client, serverURL.URL, owner, "member")
	observer := createInvitedUser(t, client, serverURL.URL, owner, "observer")

	publicAccessResp := jsonRequest(t, client, http.MethodPut, serverURL.URL+"/api/admin/public-access", owner.AccessToken, map[string]any{
		"appUrl": "https://family-chat.example.com/",
		"apiUrl": "https://family-api.example.com/",
	})
	if publicAccessResp.StatusCode != http.StatusOK {
		t.Fatalf("public access status = %d", publicAccessResp.StatusCode)
	}
	_ = decodeJSON[publicAccessSettings](t, publicAccessResp)

	inviteResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/invites", owner.AccessToken, map[string]any{
		"role": "member",
	})
	if inviteResp.StatusCode != http.StatusCreated {
		t.Fatalf("invite status = %d", inviteResp.StatusCode)
	}
	invite := decodeJSON[createInviteResponse](t, inviteResp)
	parsedInvite, err := url.Parse(invite.InviteURL)
	if err != nil {
		t.Fatalf("parse invite url: %v", err)
	}
	if parsedInvite.Scheme+"://"+parsedInvite.Host != "https://family-api.example.com" {
		t.Fatalf("unexpected invite host: %s", invite.InviteURL)
	}
	if parsedInvite.Query().Get("apiUrl") != "https://family-api.example.com" {
		t.Fatalf("expected apiUrl query, got %s", invite.InviteURL)
	}

	groupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/group", owner.AccessToken, map[string]any{
		"title":     "Private Album",
		"memberIds": []string{member.User.ID},
	})
	if groupResp.StatusCode != http.StatusCreated {
		t.Fatalf("group create status = %d", groupResp.StatusCode)
	}
	group := decodeJSON[chatPublic](t, groupResp)

	groupUploadResp := uploadFileRequest(t, client, serverURL.URL+"/api/files/upload", owner.AccessToken, group.ID, "group-photo.jpg", []byte("group-photo"))
	if groupUploadResp.StatusCode != http.StatusCreated {
		t.Fatalf("group upload status = %d", groupUploadResp.StatusCode)
	}
	groupFile := decodeJSON[filePublic](t, groupUploadResp)

	publicDownloadResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/files/"+groupFile.ID+"/download", observer.AccessToken, nil)
	if publicDownloadResp.StatusCode != http.StatusOK {
		t.Fatalf("observer public download status = %d", publicDownloadResp.StatusCode)
	}
	_ = publicDownloadResp.Body.Close()

	privateGroupResp := jsonRequest(t, client, http.MethodPatch, serverURL.URL+"/api/chats/"+group.ID, owner.AccessToken, map[string]any{
		"mediaVisibility": "members",
	})
	if privateGroupResp.StatusCode != http.StatusOK {
		t.Fatalf("group privacy status = %d", privateGroupResp.StatusCode)
	}
	privateGroup := decodeJSON[chatPublic](t, privateGroupResp)
	if privateGroup.MediaVisibility != "members" {
		t.Fatalf("unexpected group media visibility = %s", privateGroup.MediaVisibility)
	}

	observerDownloadResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/files/"+groupFile.ID+"/download", observer.AccessToken, nil)
	if observerDownloadResp.StatusCode != http.StatusNotFound {
		t.Fatalf("observer private download status = %d", observerDownloadResp.StatusCode)
	}
	_ = observerDownloadResp.Body.Close()

	memberDownloadResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/files/"+groupFile.ID+"/download", member.AccessToken, nil)
	if memberDownloadResp.StatusCode != http.StatusOK {
		t.Fatalf("member private download status = %d", memberDownloadResp.StatusCode)
	}
	_ = memberDownloadResp.Body.Close()

	server.logger.Warnf("tests.admin", "visible admin log marker")
	logsResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/admin/logs?level=WARNING&search=marker", owner.AccessToken, nil)
	if logsResp.StatusCode != http.StatusOK {
		t.Fatalf("logs status = %d", logsResp.StatusCode)
	}
	logs := decodeJSON[logsResponse](t, logsResp)
	if logs.Total == 0 {
		t.Fatalf("expected filtered admin logs")
	}

	invalidLogsResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/admin/logs?level=TRACE", owner.AccessToken, nil)
	if invalidLogsResp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("invalid logs level status = %d", invalidLogsResp.StatusCode)
	}
	_ = invalidLogsResp.Body.Close()

	invalidTunnelResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/admin/public-access/tunnel/start?provider=bogus", owner.AccessToken, nil)
	if invalidTunnelResp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("invalid tunnel provider status = %d", invalidTunnelResp.StatusCode)
	}
	_ = invalidTunnelResp.Body.Close()
}

func TestRealtimeMessageDeliveryParity(t *testing.T) {
	server, serverURL, client := newTestServer(t)

	setupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Realtime Family",
		"username":    "owner",
		"password":    "secure-password",
		"displayName": "Owner",
	})
	owner := decodeJSON[authResponse](t, setupResp)
	member := createInvitedUser(t, client, serverURL.URL, owner, "member")
	chatResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/direct", owner.AccessToken, map[string]any{
		"userId": member.User.ID,
	})
	chat := decodeJSON[chatPublic](t, chatResp)

	fakeSocket := &socketio.Socket{Id: "member-socket"}
	server.sessions.Register(member.User, fakeSocket)
	defer server.sessions.Unregister(member.User.ID, fakeSocket.Id)
	content := "Live message"
	clientMessageID := "client-1"

	message, err := server.createMessageFromSocket(owner.User, socketSendMessageRequest{
		ChatID:          chat.ID,
		Content:         &content,
		ClientMessageID: &clientMessageID,
	})
	if err != nil {
		t.Fatalf("create message from socket: %v", err)
	}
	if message.ClientMessageID == nil || *message.ClientMessageID != "client-1" {
		t.Fatalf("expected clientMessageId round-trip, got %#v", message.ClientMessageID)
	}

	deliveredCount := 0
	for _, status := range message.Statuses {
		if status.UserID == member.User.ID && status.Status == "delivered" {
			deliveredCount++
		}
	}
	if deliveredCount != 1 {
		t.Fatalf("expected delivered status for online recipient, got %d", deliveredCount)
	}
}

func TestSocketAccessTokenPrefersAuthAndFallsBackToQuery(t *testing.T) {
	server, _, _ := newTestServer(t)

	authSocket := &socketio.Socket{}
	authSocket.Handshake.Auth.Token = "auth-token"
	authSocket.Handshake.URL = "http://localhost:8000/socket.io/?token=query-token"
	if token := server.socketAccessToken(authSocket); token != "auth-token" {
		t.Fatalf("expected auth token, got %q", token)
	}

	querySocket := &socketio.Socket{}
	querySocket.Handshake.URL = "http://localhost:8000/socket.io/?token=query-token"
	if token := server.socketAccessToken(querySocket); token != "query-token" {
		t.Fatalf("expected query token, got %q", token)
	}
}

func TestChannelChatPermissions(t *testing.T) {
	_, serverURL, client := newTestServer(t)

	setupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Channel Family",
		"username":    "owner",
		"password":    "secure-password",
		"displayName": "Owner",
	})
	owner := decodeJSON[authResponse](t, setupResp)
	member := createInvitedUser(t, client, serverURL.URL, owner, "member")
	observer := createInvitedUser(t, client, serverURL.URL, owner, "observer")

	memberCreateResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/channel", member.AccessToken, map[string]any{
		"title":     "Member Channel",
		"memberIds": []string{owner.User.ID},
	})
	if memberCreateResp.StatusCode != http.StatusForbidden {
		t.Fatalf("member create channel status = %d", memberCreateResp.StatusCode)
	}
	_ = memberCreateResp.Body.Close()

	channelResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/channel", owner.AccessToken, map[string]any{
		"title":     "Announcements",
		"memberIds": []string{member.User.ID},
	})
	if channelResp.StatusCode != http.StatusCreated {
		t.Fatalf("channel create status = %d", channelResp.StatusCode)
	}
	channel := decodeJSON[chatPublic](t, channelResp)
	if channel.Type != "channel" || channel.MediaVisibility != "members" || !channel.CommentsEnabled {
		t.Fatalf("unexpected channel payload: %#v", channel)
	}

	memberGetResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/chats/"+channel.ID, member.AccessToken, nil)
	if memberGetResp.StatusCode != http.StatusOK {
		t.Fatalf("member get channel status = %d", memberGetResp.StatusCode)
	}
	_ = memberGetResp.Body.Close()

	observerGetResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/chats/"+channel.ID, observer.AccessToken, nil)
	if observerGetResp.StatusCode != http.StatusNotFound {
		t.Fatalf("observer get channel status = %d", observerGetResp.StatusCode)
	}
	_ = observerGetResp.Body.Close()

	memberSendResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/"+channel.ID+"/messages", member.AccessToken, map[string]any{
		"type":    "text",
		"content": "hello",
	})
	if memberSendResp.StatusCode != http.StatusForbidden {
		t.Fatalf("member top-level send channel status = %d", memberSendResp.StatusCode)
	}
	_ = memberSendResp.Body.Close()

	ownerSendResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/"+channel.ID+"/messages", owner.AccessToken, map[string]any{
		"type":    "text",
		"content": "Announcement",
	})
	if ownerSendResp.StatusCode != http.StatusCreated {
		t.Fatalf("owner send channel status = %d", ownerSendResp.StatusCode)
	}
	message := decodeJSON[messagePublic](t, ownerSendResp)
	if message.Content == nil || *message.Content != "Announcement" {
		t.Fatalf("unexpected channel message payload: %#v", message)
	}

	memberReplyResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/"+channel.ID+"/messages", member.AccessToken, map[string]any{
		"type":             "text",
		"content":          "Thanks!",
		"replyToMessageId": message.ID,
	})
	if memberReplyResp.StatusCode != http.StatusCreated {
		t.Fatalf("member reply in channel status = %d", memberReplyResp.StatusCode)
	}
	memberReply := decodeJSON[messagePublic](t, memberReplyResp)
	if memberReply.ReplyToMessageID == nil || *memberReply.ReplyToMessageID != message.ID {
		t.Fatalf("unexpected channel reply payload: %#v", memberReply.ReplyToMessageID)
	}

	invalidReplyResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/"+channel.ID+"/messages", member.AccessToken, map[string]any{
		"type":             "text",
		"content":          "Invalid reply target",
		"replyToMessageId": "does-not-exist",
	})
	if invalidReplyResp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("member invalid reply target status = %d", invalidReplyResp.StatusCode)
	}
	_ = invalidReplyResp.Body.Close()

	disableCommentsResp := jsonRequest(t, client, http.MethodPatch, serverURL.URL+"/api/chats/"+channel.ID, owner.AccessToken, map[string]any{
		"commentsEnabled": false,
	})
	if disableCommentsResp.StatusCode != http.StatusOK {
		t.Fatalf("disable comments status = %d", disableCommentsResp.StatusCode)
	}
	updatedChannel := decodeJSON[chatPublic](t, disableCommentsResp)
	if updatedChannel.CommentsEnabled {
		t.Fatalf("expected comments to be disabled")
	}

	memberReplyDisabledResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/"+channel.ID+"/messages", member.AccessToken, map[string]any{
		"type":             "text",
		"content":          "Still trying",
		"replyToMessageId": message.ID,
	})
	if memberReplyDisabledResp.StatusCode != http.StatusForbidden {
		t.Fatalf("member reply while comments disabled status = %d", memberReplyDisabledResp.StatusCode)
	}
	_ = memberReplyDisabledResp.Body.Close()

	ownerPostWhenDisabledResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/"+channel.ID+"/messages", owner.AccessToken, map[string]any{
		"type":    "text",
		"content": "Comments are now off",
	})
	if ownerPostWhenDisabledResp.StatusCode != http.StatusCreated {
		t.Fatalf("owner post while comments disabled status = %d", ownerPostWhenDisabledResp.StatusCode)
	}
	_ = ownerPostWhenDisabledResp.Body.Close()
}

func TestForwardMessageClonesAttachmentsAndMetadata(t *testing.T) {
	server, serverURL, client := newTestServer(t)

	setupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Forward Family",
		"username":    "owner",
		"password":    "secure-password",
		"displayName": "Owner",
	})
	owner := decodeJSON[authResponse](t, setupResp)
	member := createInvitedUser(t, client, serverURL.URL, owner, "member")

	directResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/direct", owner.AccessToken, map[string]any{
		"userId": member.User.ID,
	})
	directChat := decodeJSON[chatPublic](t, directResp)

	uploadResp := uploadFileRequest(t, client, serverURL.URL+"/api/files/upload", owner.AccessToken, directChat.ID, "photo.jpg", []byte("forward-photo"))
	if uploadResp.StatusCode != http.StatusCreated {
		t.Fatalf("upload status = %d", uploadResp.StatusCode)
	}
	originalFile := decodeJSON[filePublic](t, uploadResp)
	thumbnailKey := "family/forward/thumbnail.jpg"
	if err := server.storage.Save(thumbnailKey, []byte("forward-thumbnail")); err != nil {
		t.Fatalf("save thumbnail: %v", err)
	}
	if _, err := testPersistenceClient(t, server).File.UpdateOneID(originalFile.ID).SetThumbnailObjectKey(thumbnailKey).Save(context.Background()); err != nil {
		t.Fatalf("set thumbnail key: %v", err)
	}

	sendResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/"+directChat.ID+"/messages", owner.AccessToken, map[string]any{
		"type":    "mixed",
		"content": "Original message",
		"fileIds": []string{originalFile.ID},
	})
	if sendResp.StatusCode != http.StatusCreated {
		t.Fatalf("send original status = %d", sendResp.StatusCode)
	}
	originalMessage := decodeJSON[messagePublic](t, sendResp)

	chatsResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/chats", owner.AccessToken, nil)
	chats := decodeJSON[[]chatPublic](t, chatsResp)
	familyChatID := ""
	for _, chat := range chats {
		if chat.Type == "family" {
			familyChatID = chat.ID
			break
		}
	}
	if familyChatID == "" {
		t.Fatalf("expected family chat")
	}

	forwardResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/messages/"+originalMessage.ID+"/forward", owner.AccessToken, map[string]any{
		"chatId": familyChatID,
	})
	if forwardResp.StatusCode != http.StatusCreated {
		t.Fatalf("forward status = %d", forwardResp.StatusCode)
	}
	forwarded := decodeJSON[messagePublic](t, forwardResp)
	if forwarded.ForwardedFrom == nil || forwarded.ForwardedFrom.MessageID != originalMessage.ID || forwarded.ForwardedFrom.ChatID != directChat.ID {
		t.Fatalf("unexpected forwarded metadata: %#v", forwarded.ForwardedFrom)
	}
	if forwarded.Content == nil || *forwarded.Content != "Original message" {
		t.Fatalf("unexpected forwarded content: %#v", forwarded.Content)
	}
	if len(forwarded.Attachments) != 1 {
		t.Fatalf("expected forwarded attachment, got %#v", forwarded.Attachments)
	}
	if forwarded.Attachments[0].ID == originalFile.ID {
		t.Fatalf("expected cloned attachment id")
	}
	if forwarded.Attachments[0].ChatID == nil || *forwarded.Attachments[0].ChatID != familyChatID {
		t.Fatalf("unexpected forwarded attachment chat: %#v", forwarded.Attachments[0].ChatID)
	}
	if forwarded.Attachments[0].ThumbnailObjectKey == nil || *forwarded.Attachments[0].ThumbnailObjectKey == thumbnailKey {
		t.Fatalf("forwarded thumbnail key = %#v, want a cloned key", forwarded.Attachments[0].ThumbnailObjectKey)
	}
	thumbnail, err := server.storage.Read(*forwarded.Attachments[0].ThumbnailObjectKey)
	if err != nil || string(thumbnail) != "forward-thumbnail" {
		t.Fatalf("forwarded thumbnail = %q, %v; want cloned thumbnail", thumbnail, err)
	}

	downloadResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/files/"+forwarded.Attachments[0].ID+"/download", owner.AccessToken, nil)
	if downloadResp.StatusCode != http.StatusOK {
		t.Fatalf("forwarded attachment download status = %d", downloadResp.StatusCode)
	}
	_ = downloadResp.Body.Close()
}

func TestMessageReactionsAreInlineAndIdempotent(t *testing.T) {
	_, serverURL, client := newTestServer(t)

	setupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Reaction Family",
		"username":    "owner",
		"password":    "secure-password",
		"displayName": "Owner",
	})
	owner := decodeJSON[authResponse](t, setupResp)
	member := createInvitedUser(t, client, serverURL.URL, owner, "member")

	directResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/direct", owner.AccessToken, map[string]any{
		"userId": member.User.ID,
	})
	directChat := decodeJSON[chatPublic](t, directResp)

	messageResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/"+directChat.ID+"/messages", owner.AccessToken, map[string]any{
		"type":    "text",
		"content": "React to me",
	})
	message := decodeJSON[messagePublic](t, messageResp)

	invalidReactionResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/messages/"+message.ID+"/reactions", member.AccessToken, map[string]any{
		"emoji": "   ",
	})
	if invalidReactionResp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("invalid reaction status = %d", invalidReactionResp.StatusCode)
	}
	_ = invalidReactionResp.Body.Close()

	memberReactionResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/messages/"+message.ID+"/reactions", member.AccessToken, map[string]any{
		"emoji": "👍",
	})
	if memberReactionResp.StatusCode != http.StatusOK {
		t.Fatalf("member reaction status = %d", memberReactionResp.StatusCode)
	}
	memberReaction := decodeJSON[messagePublic](t, memberReactionResp)
	if len(memberReaction.Reactions) != 1 || memberReaction.Reactions[0].Count != 1 || !memberReaction.Reactions[0].Reacted {
		t.Fatalf("unexpected member reaction payload: %#v", memberReaction.Reactions)
	}

	memberReactionRepeatResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/messages/"+message.ID+"/reactions", member.AccessToken, map[string]any{
		"emoji": "👍",
	})
	memberReactionRepeat := decodeJSON[messagePublic](t, memberReactionRepeatResp)
	if len(memberReactionRepeat.Reactions) != 1 || memberReactionRepeat.Reactions[0].Count != 1 {
		t.Fatalf("expected idempotent member reaction: %#v", memberReactionRepeat.Reactions)
	}

	ownerReactionResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/messages/"+message.ID+"/reactions", owner.AccessToken, map[string]any{
		"emoji": "👍",
	})
	if ownerReactionResp.StatusCode != http.StatusOK {
		t.Fatalf("owner reaction status = %d", ownerReactionResp.StatusCode)
	}
	ownerReaction := decodeJSON[messagePublic](t, ownerReactionResp)
	if len(ownerReaction.Reactions) != 1 || ownerReaction.Reactions[0].Count != 2 {
		t.Fatalf("unexpected owner reaction payload: %#v", ownerReaction.Reactions)
	}

	historyResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/chats/"+directChat.ID+"/messages", member.AccessToken, nil)
	history := decodeJSON[messageHistoryPage](t, historyResp)
	if len(history.Messages) != 1 || len(history.Messages[0].Reactions) != 1 || history.Messages[0].Reactions[0].Count != 2 || !history.Messages[0].Reactions[0].Reacted {
		t.Fatalf("unexpected message history reactions: %#v", history)
	}

	removeResp := jsonRequest(t, client, http.MethodDelete, serverURL.URL+"/api/messages/"+message.ID+"/reactions/"+url.PathEscape("👍"), member.AccessToken, nil)
	if removeResp.StatusCode != http.StatusOK {
		t.Fatalf("remove reaction status = %d", removeResp.StatusCode)
	}
	removed := decodeJSON[messagePublic](t, removeResp)
	if len(removed.Reactions) != 1 || removed.Reactions[0].Count != 1 || removed.Reactions[0].Reacted {
		t.Fatalf("unexpected removed reaction payload: %#v", removed.Reactions)
	}
}
