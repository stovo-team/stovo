package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/netip"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"family-messenger/backend/internal/tunnel"

	"github.com/google/uuid"
)

func (s *Server) handleAdminLogs(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}

	limit := 200
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 1000 {
			s.detail(w, http.StatusUnprocessableEntity, "Invalid limit")
			return
		}
		limit = value
	}
	levelFilter := strings.TrimSpace(strings.ToUpper(r.URL.Query().Get("level")))
	loggerFilter := strings.TrimSpace(r.URL.Query().Get("logger"))
	searchFilter := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("search")))
	if levelFilter != "" && !slices.Contains([]string{"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}, levelFilter) {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid level")
		return
	}
	if len(loggerFilter) > 200 {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid logger filter")
		return
	}
	if len(searchFilter) > 500 {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid search filter")
		return
	}

	records := s.logBuffer.Records()
	filtered := make([]logRecord, 0, len(records))
	for _, record := range records {
		if levelFilter != "" && record.Level != levelFilter {
			continue
		}
		if loggerFilter != "" && !strings.Contains(record.Logger, loggerFilter) {
			continue
		}
		if searchFilter != "" && !strings.Contains(strings.ToLower(record.Message), searchFilter) {
			continue
		}
		filtered = append(filtered, logRecord(record))
	}
	if len(filtered) > limit {
		filtered = filtered[len(filtered)-limit:]
	}
	s.json(w, http.StatusOK, logsResponse{
		Records:    filtered,
		Total:      len(filtered),
		BufferSize: len(records),
		Limit:      limit,
	})
}

func (s *Server) handleGetPublicAccess(w http.ResponseWriter, _ *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	family, err := s.getFamily(user.FamilyID)
	if err != nil {
		s.detail(w, http.StatusNotFound, "Family not found")
		return
	}
	settings := publicAccessSettingsForFamily(family, s.cfg.AppURL, s.cfg.APIURL)
	s.json(w, http.StatusOK, settings)
}

func (s *Server) handleUpdatePublicAccess(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	var payload publicAccessUpdateRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	appURL, err := normalizePublicURL(payload.AppURL)
	if err != nil {
		s.detail(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	apiURL, err := normalizePublicURL(payload.APIURL)
	if err != nil {
		s.detail(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		_, err := s.txExec(tx, `
			UPDATE families
			SET public_app_url = ?, public_api_url = ?, updated_at = ?
			WHERE id = ?
		`, appURL, apiURL, nowString(), user.FamilyID)
		return err
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not update public access")
		return
	}
	family, _ := s.getFamily(user.FamilyID)
	s.json(w, http.StatusOK, publicAccessSettingsForFamily(family, s.cfg.AppURL, s.cfg.APIURL))
}

func (s *Server) handlePublicAccessSuggestions(w http.ResponseWriter, _ *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	candidates := []publicAccessCandidate{
		{
			Label:  "Localhost",
			AppURL: s.cfg.AppURL,
			APIURL: s.cfg.APIURL,
		},
	}
	for _, host := range candidateAddresses() {
		publicURL := "http://" + host + ":8000"

		candidates = append(candidates, publicAccessCandidate{
			Label:  host,
			AppURL: publicURL,
			APIURL: publicURL,
		})
	}
	s.json(w, http.StatusOK, publicAccessSuggestions{Candidates: candidates})
}

func (s *Server) handlePublicAccessCheck(w http.ResponseWriter, _ *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	family, err := s.getFamily(user.FamilyID)
	if err != nil {
		s.detail(w, http.StatusNotFound, "Family not found")
		return
	}
	settings := publicAccessSettingsForFamily(family, s.cfg.AppURL, s.cfg.APIURL)
	frontendOK, frontendCode, frontendDetail := checkURL(settings.AppURL, 2500*time.Millisecond)
	apiOK, apiCode, apiDetail := checkURL(settings.APIURL+"/api/health", 2500*time.Millisecond)
	targets := []publicAccessCheckTarget{
		{Name: "Frontend", URL: settings.AppURL, OK: frontendOK, StatusCode: frontendCode, Detail: frontendDetail},
		{Name: "API health", URL: settings.APIURL + "/api/health", OK: apiOK, StatusCode: apiCode, Detail: apiDetail},
	}
	allOK := slices.IndexFunc(targets, func(target publicAccessCheckTarget) bool { return !target.OK }) == -1
	s.json(w, http.StatusOK, publicAccessCheckResponse{AllOK: allOK, Targets: targets})
}

func (s *Server) handleTunnelStatus(w http.ResponseWriter, _ *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	family, err := s.getFamily(user.FamilyID)
	if err != nil {
		s.detail(w, http.StatusNotFound, "Family not found")
		return
	}
	snapshot := s.tunnel.Status()
	status := s.snapshotToTunnelStatus(snapshot, family)
	s.json(w, http.StatusOK, status)
}

func (s *Server) handleTunnelStart(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}

	provider := strings.TrimSpace(r.URL.Query().Get("provider"))
	if provider == "" {
		provider = "cloudflare"
	}
	if provider != "cloudflare" && provider != "localtunnel" {
		s.detail(w, http.StatusUnprocessableEntity, "Unsupported tunnel provider")
		return
	}

	autoRestart := true
	if raw := strings.TrimSpace(r.URL.Query().Get("autoRestart")); raw != "" {
		autoRestart = raw != "false" && raw != "0"
	}

	snapshot := s.tunnel.Start(s.backendTunnelOrigin(), provider, autoRestart)
	if snapshot.URL != nil {
		publicURL := strings.TrimRight(*snapshot.URL, "/")

		// LocalTunnel is frequently affected by its public warning/verification page,
		// so keep strict backend validation for it. Cloudflare DNS can take a few
		// seconds to resolve from Docker's internal DNS, so do not hard-fail it here.
		if provider == "localtunnel" {
			if err := s.validatePublicBackendURL(publicURL); err != nil {
				_ = s.tunnel.Stop()
				s.detail(w, http.StatusBadGateway, "LocalTunnel started but backend is not reachable through it: "+err.Error())
				return
			}
		}

		if err := s.saveFamilyPublicURLs(r.Context(), user.FamilyID, publicURL, publicURL); err != nil {
			s.detail(w, http.StatusInternalServerError, "Could not save public tunnel URL")
			return
		}
	}

	family, err := s.getFamily(user.FamilyID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load public access")
		return
	}

	s.json(w, http.StatusOK, s.snapshotToTunnelStatus(snapshot, family))
}

func (s *Server) handleDomainLink(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	var payload domainLinkRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	domain, err := normalizeDomain(payload.Domain)
	if err != nil {
		s.detail(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	apiDomain := domain
	if payload.APIDomain != nil && strings.TrimSpace(*payload.APIDomain) != "" {
		apiDomain, err = normalizeDomain(*payload.APIDomain)
		if err != nil {
			s.detail(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
	}
	publicIP, err := detectPublicIPv4()
	if err != nil {
		s.detail(w, http.StatusBadGateway, "Could not detect public IP")
		return
	}
	appURL := "https://" + domain
	apiURL := "https://" + apiDomain
	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		_, execErr := s.txExec(tx, `
			UPDATE families
			SET public_app_url = ?, public_api_url = ?, updated_at = ?
			WHERE id = ?
		`, appURL, apiURL, nowString(), user.FamilyID)
		return execErr
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not update public access")
		return
	}
	family, _ := s.getFamily(user.FamilyID)
	settings := publicAccessSettingsForFamily(family, s.cfg.AppURL, s.cfg.APIURL)
	records := []domainDNSRecord{
		{Type: "A", Name: domain, Value: publicIP, Proxied: false},
	}
	if apiDomain != domain {
		records = append(records, domainDNSRecord{Type: "A", Name: apiDomain, Value: publicIP, Proxied: false})
	}
	s.json(w, http.StatusOK, domainLinkResponse{
		PublicIP:     publicIP,
		AppURL:       appURL,
		APIURL:       apiURL,
		Records:      records,
		PublicAccess: &settings,
	})
}

func (s *Server) handleTunnelStop(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	current := s.tunnel.Status()
	snapshot := s.tunnel.Stop()
	if current.URL != nil {
		family, err := s.getFamily(user.FamilyID)
		if err == nil {
			shouldClearApp := family.PublicAppURL != nil && *family.PublicAppURL == *current.URL
			shouldClearAPI := family.PublicAPIURL != nil && *family.PublicAPIURL == *current.URL
			if shouldClearApp || shouldClearAPI {
				_ = s.withTx(r.Context(), func(tx *sql.Tx) error {
					var appURL any = family.PublicAppURL
					var apiURL any = family.PublicAPIURL
					if shouldClearApp {
						appURL = nil
					}
					if shouldClearAPI {
						apiURL = nil
					}
					_, err := s.txExec(tx, `
						UPDATE families
						SET public_app_url = ?, public_api_url = ?, updated_at = ?
						WHERE id = ?
					`, appURL, apiURL, nowString(), user.FamilyID)
					return err
				})
			}
		}
	}
	family, _ := s.getFamily(user.FamilyID)
	s.json(w, http.StatusOK, s.snapshotToTunnelStatus(snapshot, family))
}

func (s *Server) handleGetEncryptionSettings(w http.ResponseWriter, _ *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	family, err := s.getFamily(user.FamilyID)
	if err != nil {
		s.detail(w, http.StatusNotFound, "Family not found")
		return
	}
	s.json(w, http.StatusOK, encryptionSettingsResponse{
		DefaultMessageEncryptionProtocol: family.DefaultMessageEncryptionProtocol,
		SupportedProtocols:               supportedEncryptionProtocols(),
		CompatibilityNotes: []string{
			"Changing the default applies to new chats only.",
			"Existing plaintext messages remain readable as legacy history.",
		},
	})
}

func (s *Server) handleUpdateEncryptionSettings(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	var payload encryptionSettingsUpdateRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	protocol, err := normalizeEncryptionProtocol(payload.DefaultMessageEncryptionProtocol)
	if err != nil {
		s.detail(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		_, err := s.txExec(tx, `
			UPDATE families
			SET default_message_encryption_protocol = ?, updated_at = ?
			WHERE id = ?
		`, protocol, nowString(), user.FamilyID)
		return err
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not update encryption settings")
		return
	}
	s.json(w, http.StatusOK, encryptionSettingsResponse{
		DefaultMessageEncryptionProtocol: protocol,
		SupportedProtocols:               supportedEncryptionProtocols(),
		CompatibilityNotes: []string{
			"Changing the default applies to new chats only.",
			"Existing plaintext messages remain readable as legacy history.",
		},
	})
}

func (s *Server) handleQuickStartPublicAccess(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}

	provider := "cloudflare"
	snapshot := s.tunnel.Start(s.backendTunnelOrigin(), provider, true)
	if snapshot.URL == nil {
		message := "Could not create public tunnel"
		if snapshot.Message != nil && strings.TrimSpace(*snapshot.Message) != "" {
			message = *snapshot.Message
		}
		s.detail(w, http.StatusBadGateway, message)
		return
	}

	publicURL := strings.TrimRight(*snapshot.URL, "/")
	if err := s.waitForPublicBackendURL(publicURL, 60*time.Second); err != nil {
		_ = s.tunnel.Stop()
		s.detail(w, http.StatusBadGateway, "Cloudflare tunnel could not become reachable. Try again. "+err.Error())
		return
	}

	if err := s.saveFamilyPublicURLs(r.Context(), user.FamilyID, publicURL, publicURL); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not save public access")
		return
	}

	family, err := s.getFamily(user.FamilyID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load family")
		return
	}

	inviteLinks, err := s.createPublicInviteLinks(r.Context(), user, family)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create invite links")
		return
	}

	settings := publicAccessSettingsForFamily(family, s.cfg.AppURL, s.cfg.APIURL)

	s.json(w, http.StatusOK, quickStartPublicAccessResponse{
		Status:       snapshot.State,
		Provider:     provider,
		PublicURL:    publicURL,
		Origin:       snapshot.Origin,
		Message:      strPtr("Cloudflare Tunnel is ready."),
		PublicAccess: settings,
		InviteLinks:  inviteLinks,
	})
}

func (s *Server) handlePublicIPQuickStart(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}

	publicIP, err := detectPublicIPv4()
	if err != nil {
		s.json(w, http.StatusOK, publicIPQuickStartResponse{
			Status: "blocked",
			Problems: []string{
				"Could not detect your public IP address.",
			},
			RecommendedActions: []string{
				"Use Cloudflare Tunnel for one-click access.",
			},
			CanUseCloudflareTunnel: true,
		})
		return
	}

	publicURL := "http://" + publicIP + ":8000"

	if !s.checkLocalBackendHealth() {
		s.json(w, http.StatusOK, publicIPQuickStartResponse{
			Status:    "blocked",
			PublicIP:  publicIP,
			PublicURL: publicURL,
			Problems: []string{
				"Backend is not reachable locally on TCP port 8000.",
			},
			RecommendedActions: []string{
				"Make sure the backend is running.",
				"Make sure Docker exposes port 8000.",
				"Then try Public IP again.",
			},
			CanUseCloudflareTunnel: true,
		})
		return
	}

	externalOK, externalDetail := s.checkPublicURLFromOutside(publicURL + "/api/health")
	if !externalOK {
		s.json(w, http.StatusOK, publicIPQuickStartResponse{
			Status:    "blocked",
			PublicIP:  publicIP,
			PublicURL: publicURL,
			Problems: []string{
				"Your public IP is not reachable from the internet on TCP port 8000.",
				externalDetail,
			},
			RecommendedActions: []string{
				"Use Cloudflare Tunnel for one-click access.",
				"Or forward TCP port 8000 on your router to this computer.",
				"Allow TCP port 8000 in Windows Firewall.",
				"If your ISP uses CGNAT, ask for a real public/static IP or use Cloudflare Tunnel.",
			},
			CanUseCloudflareTunnel: true,
		})
		return
	}

	if err := s.saveFamilyPublicURLs(r.Context(), user.FamilyID, publicURL, publicURL); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not save public IP access")
		return
	}

	family, err := s.getFamily(user.FamilyID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load family")
		return
	}

	inviteLinks, err := s.createPublicInviteLinks(r.Context(), user, family)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create invite links")
		return
	}

	settings := publicAccessSettingsForFamily(family, s.cfg.AppURL, s.cfg.APIURL)

	s.json(w, http.StatusOK, publicIPQuickStartResponse{
		Status:                 "ready",
		PublicIP:               publicIP,
		PublicURL:              publicURL,
		PublicAccess:           &settings,
		InviteLinks:            inviteLinks,
		Problems:               []string{},
		RecommendedActions:     []string{},
		CanUseCloudflareTunnel: true,
	})
}

func (s *Server) backendTunnelOrigin() string {
	origin := strings.TrimSpace(s.cfg.PublicTunnelOrigin)
	parsed, err := url.Parse(origin)
	if err == nil && parsed.Port() == strconv.Itoa(s.cfg.Port) {
		return strings.TrimRight(origin, "/")
	}
	return fmt.Sprintf("http://127.0.0.1:%d", s.cfg.Port)
}

func (s *Server) saveFamilyPublicURLs(ctx context.Context, familyID string, appURL string, apiURL string) error {
	appURL = strings.TrimRight(strings.TrimSpace(appURL), "/")
	apiURL = strings.TrimRight(strings.TrimSpace(apiURL), "/")

	return s.withTx(ctx, func(tx *sql.Tx) error {
		_, err := s.txExec(tx, `
			UPDATE families
			SET public_app_url = ?, public_api_url = ?, updated_at = ?
			WHERE id = ?
		`, appURL, apiURL, nowString(), familyID)
		return err
	})
}

func (s *Server) validatePublicBackendURL(publicURL string) error {
	healthURL := strings.TrimRight(publicURL, "/") + "/api/health"

	req, err := http.NewRequest(http.MethodGet, healthURL, nil)
	if err != nil {
		return err
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("bypass-tunnel-reminder", "1")
	req.Header.Set("abypass-tunnel-reminder", "1")

	client := &http.Client{Timeout: 8 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("health returned status %d", res.StatusCode)
	}

	var payload map[string]any
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return errors.New("health endpoint did not return backend JSON")
	}

	return nil
}

func (s *Server) waitForPublicBackendURL(publicURL string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	backoff := 2 * time.Second
	var lastErr error

	for {
		if err := s.validatePublicBackendURL(publicURL); err == nil {
			return nil
		} else {
			lastErr = err
		}

		if time.Now().After(deadline) {
			if lastErr == nil {
				return errors.New("timed out waiting for public health check")
			}
			return fmt.Errorf("timed out waiting for public health check: %w", lastErr)
		}

		time.Sleep(backoff)
		if backoff < 5*time.Second {
			backoff++
		}
	}
}

func (s *Server) checkLocalBackendHealth() bool {
	healthURL := fmt.Sprintf("http://127.0.0.1:%d/api/health", s.cfg.Port)

	client := &http.Client{Timeout: 2 * time.Second}
	res, err := client.Get(healthURL)
	if err != nil {
		return false
	}
	defer res.Body.Close()

	return res.StatusCode >= 200 && res.StatusCode < 300
}

func (s *Server) checkPublicURLFromOutside(targetURL string) (bool, string) {
	checkerURL := strings.TrimSpace(s.cfg.PublicReachabilityCheckerURL)
	if checkerURL == "" {
		return false, "External reachability checker is not configured, so Public IP access cannot be safely verified."
	}

	requestURL := strings.TrimRight(checkerURL, "?") + "?url=" + url.QueryEscape(targetURL)

	client := &http.Client{Timeout: 10 * time.Second}
	res, err := client.Get(requestURL)
	if err != nil {
		return false, err.Error()
	}
	defer res.Body.Close()

	var payload struct {
		OK         bool   `json:"ok"`
		StatusCode int    `json:"statusCode"`
		Detail     string `json:"detail"`
	}

	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return false, "Invalid reachability checker response."
	}

	if !payload.OK {
		if payload.Detail != "" {
			return false, payload.Detail
		}
		return false, fmt.Sprintf("External checker returned status %d.", payload.StatusCode)
	}

	return true, "reachable"
}

func (s *Server) createPublicInviteLinks(ctx context.Context, user userPublic, family familyPublic) ([]publicInviteLink, error) {
	rawToken, err := randomToken()
	if err != nil {
		return nil, err
	}

	inviteID := uuid.NewString()
	expiresAt := time.Now().Add(7 * 24 * time.Hour).UTC()
	maxUses := 10
	role := memberRole

	err = s.withTx(ctx, func(tx *sql.Tx) error {
		_, err := s.txExec(tx, `
			INSERT INTO invites (id, family_id, token_hash, role, expires_at, max_uses, used_count, created_by, created_at)
			VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
		`, inviteID, user.FamilyID, tokenHash(s.cfg.InviteTokenSecret, rawToken), role, expiresAt.Format(time.RFC3339Nano), maxUses, user.ID, nowString())
		return err
	})
	if err != nil {
		return nil, err
	}

	return []publicInviteLink{{
		ID:        inviteID,
		Role:      role,
		URL:       buildInviteURL(family, s.cfg.AppURL, s.cfg.APIURL, rawToken),
		ExpiresAt: expiresAt,
		MaxUses:   maxUses,
		UsedCount: 0,
	}}, nil
}

func (s *Server) snapshotToTunnelStatus(snapshot tunnel.Snapshot, family familyPublic) publicTunnelStatus {
	settings := publicAccessSettingsForFamily(family, s.cfg.AppURL, s.cfg.APIURL)
	return publicTunnelStatus{
		State:        snapshot.State,
		Provider:     snapshot.Provider,
		URL:          snapshot.URL,
		Origin:       snapshot.Origin,
		Message:      snapshot.Message,
		Logs:         snapshot.Logs,
		AutoRestart:  snapshot.AutoRestart,
		Restarts:     snapshot.Restarts,
		PublicAccess: &settings,
	}
}

var domainPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$`)

func normalizeDomain(raw string) (string, error) {
	value := strings.TrimSpace(strings.ToLower(raw))
	value = strings.TrimPrefix(value, "https://")
	value = strings.TrimPrefix(value, "http://")
	if parsed, err := url.Parse("https://" + value); err == nil {
		value = strings.TrimSpace(parsed.Hostname())
	}
	if value == "" || strings.Contains(value, "/") || !domainPattern.MatchString(value) || !strings.Contains(value, ".") {
		return "", errors.New("Invalid domain")
	}
	return value, nil
}

func detectPublicIPv4() (string, error) {
	client := &http.Client{Timeout: 4 * time.Second}
	sources := []string{
		"https://api.ipify.org?format=json",
		"https://checkip.amazonaws.com",
	}
	for _, source := range sources {
		request, _ := http.NewRequest(http.MethodGet, source, nil)
		response, err := client.Do(request)
		if err != nil {
			continue
		}
		rawIP, decodeErr := func() (string, error) {
			defer response.Body.Close()
			if strings.Contains(source, "ipify") {
				var payload struct {
					IP string `json:"ip"`
				}
				if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
					return "", err
				}
				return payload.IP, nil
			}
			body, readErr := io.ReadAll(response.Body)
			if readErr != nil {
				return "", readErr
			}
			return string(body), nil
		}()
		if decodeErr != nil {
			continue
		}
		parsed, err := netip.ParseAddr(strings.TrimSpace(rawIP))
		if err == nil && parsed.Is4() {
			return parsed.String(), nil
		}
	}
	return "", errors.New("public ip not detected")
}
