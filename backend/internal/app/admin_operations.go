package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/netip"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	featureadministration "stovo-messenger/backend/internal/features/administration"
	featurefamily "stovo-messenger/backend/internal/features/family"
	httptransport "stovo-messenger/backend/internal/transport/http"
	"stovo-messenger/backend/internal/tunnel"

	"github.com/google/uuid"
)

func (s *Server) adminPublicAccessHandler(user userPublic) httptransport.AdminPublicAccessHandler {
	return httptransport.NewAdminPublicAccessHandler(httptransport.AdminPublicAccessOperations{
		IsAdmin: func(actor httptransport.AdminActor) bool { return s.requireAdmin(user) == nil },
		Get: func(_ context.Context, actor httptransport.AdminActor) (any, error) {
			family, err := s.getFamily(actor.FamilyID)
			if err != nil {
				return nil, err
			}
			return publicAccessSettingsForFamily(family, s.cfg.AppURL, s.cfg.APIURL), nil
		},
		Update: func(ctx context.Context, actor httptransport.AdminActor, rawAppURL, rawAPIURL *string) (any, error) {
			appURL, err := normalizePublicURL(rawAppURL)
			if err != nil {
				return nil, err
			}
			apiURL, err := normalizePublicURL(rawAPIURL)
			if err != nil {
				return nil, err
			}
			if err := s.publicAccess.Save(ctx, actor.FamilyID, featureadministration.PublicURLs{AppURL: appURL, APIURL: apiURL}); err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not update public access"}
			}
			family, err := s.getFamily(actor.FamilyID)
			if err != nil {
				return nil, err
			}
			return publicAccessSettingsForFamily(family, s.cfg.AppURL, s.cfg.APIURL), nil
		},
		Suggestions: func(_ context.Context, _ httptransport.AdminActor) (any, error) {
			candidates := []publicAccessCandidate{{Label: "Localhost", AppURL: s.cfg.AppURL, APIURL: s.cfg.APIURL}}
			for _, host := range candidateAddresses() {
				publicURL := "http://" + host + ":8000"
				candidates = append(candidates, publicAccessCandidate{Label: host, AppURL: publicURL, APIURL: publicURL})
			}
			return publicAccessSuggestions{Candidates: candidates}, nil
		},
		Check: func(_ context.Context, actor httptransport.AdminActor) (any, error) {
			family, err := s.getFamily(actor.FamilyID)
			if err != nil {
				return nil, err
			}
			settings := publicAccessSettingsForFamily(family, s.cfg.AppURL, s.cfg.APIURL)
			frontendOK, frontendCode, frontendDetail := checkURL(settings.AppURL, 2500*time.Millisecond)
			apiOK, apiCode, apiDetail := checkURL(settings.APIURL+"/api/health", 2500*time.Millisecond)
			targets := []publicAccessCheckTarget{{Name: "Frontend", URL: settings.AppURL, OK: frontendOK, StatusCode: frontendCode, Detail: frontendDetail}, {Name: "API health", URL: settings.APIURL + "/api/health", OK: apiOK, StatusCode: apiCode, Detail: apiDetail}}
			allOK := true
			for _, target := range targets {
				if !target.OK {
					allOK = false
					break
				}
			}
			return publicAccessCheckResponse{AllOK: allOK, Targets: targets}, nil
		},
		GetEncryption: func(_ context.Context, actor httptransport.AdminActor) (any, error) {
			family, err := s.getFamily(actor.FamilyID)
			if err != nil {
				return nil, err
			}
			return encryptionSettingsResponse{DefaultMessageEncryptionProtocol: family.DefaultMessageEncryptionProtocol, SupportedProtocols: supportedEncryptionProtocols(), CompatibilityNotes: []string{"Changing the default applies to new chats only.", "Existing plaintext messages remain readable as legacy history."}}, nil
		},
		UpdateEncryption: func(ctx context.Context, actor httptransport.AdminActor, protocol string) (any, error) {
			protocol, err := s.encryption.Set(ctx, actor.FamilyID, protocol)
			if err != nil {
				return nil, err
			}
			return encryptionSettingsResponse{DefaultMessageEncryptionProtocol: protocol, SupportedProtocols: supportedEncryptionProtocols(), CompatibilityNotes: []string{"Changing the default applies to new chats only.", "Existing plaintext messages remain readable as legacy history."}}, nil
		},
		TunnelStatus: func(_ context.Context, actor httptransport.AdminActor) (any, error) {
			family, err := s.getFamily(actor.FamilyID)
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusNotFound, Detail: "Family not found"}
			}
			snapshot := s.tunnel.Status()
			s.syncFamilyPublicURLsFromTunnelSnapshot(context.Background(), actor.FamilyID, snapshot, family)
			family, _ = s.getFamily(actor.FamilyID)
			return s.snapshotToTunnelStatus(snapshot, family), nil
		},
		TunnelStart: func(ctx context.Context, actor httptransport.AdminActor, provider string, autoRestart bool) (any, error) {
			snapshot := s.tunnel.Start(s.backendTunnelOrigin(), provider, autoRestart)
			if snapshot.URL != nil {
				publicURL := strings.TrimRight(*snapshot.URL, "/")
				if provider == "localtunnel" {
					if err := s.validatePublicBackendURL(publicURL); err != nil {
						_ = s.tunnel.Stop()
						return nil, httptransport.AdminHTTPError{Status: http.StatusBadGateway, Detail: "LocalTunnel started but backend is not reachable through it: " + err.Error()}
					}
				}
				if err := s.saveFamilyPublicURLs(ctx, actor.FamilyID, publicURL, publicURL); err != nil {
					return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not save public tunnel URL"}
				}
			}
			family, err := s.getFamily(actor.FamilyID)
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not load public access"}
			}
			return s.snapshotToTunnelStatus(snapshot, family), nil
		},
		DomainLink: func(ctx context.Context, actor httptransport.AdminActor, payload httptransport.DomainLinkPayload) (any, error) {
			domain, err := normalizeDomain(payload.Domain)
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusUnprocessableEntity, Detail: err.Error()}
			}
			apiDomain := domain
			if payload.APIDomain != nil && strings.TrimSpace(*payload.APIDomain) != "" {
				apiDomain, err = normalizeDomain(*payload.APIDomain)
				if err != nil {
					return nil, httptransport.AdminHTTPError{Status: http.StatusUnprocessableEntity, Detail: err.Error()}
				}
			}
			publicIP, err := detectPublicIPv4()
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusBadGateway, Detail: "Could not detect public IP"}
			}
			appURL := "https://" + domain
			apiURL := "https://" + apiDomain
			if err := s.publicAccess.Save(ctx, actor.FamilyID, featureadministration.PublicURLs{AppURL: &appURL, APIURL: &apiURL}); err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not update public access"}
			}
			family, _ := s.getFamily(actor.FamilyID)
			settings := publicAccessSettingsForFamily(family, s.cfg.AppURL, s.cfg.APIURL)
			records := []domainDNSRecord{
				{Type: "A", Name: domain, Value: publicIP, Proxied: false},
			}
			if apiDomain != domain {
				records = append(records, domainDNSRecord{Type: "A", Name: apiDomain, Value: publicIP, Proxied: false})
			}
			return domainLinkResponse{
				PublicIP:     publicIP,
				AppURL:       appURL,
				APIURL:       apiURL,
				Records:      records,
				PublicAccess: &settings,
			}, nil
		},
		TunnelStop: func(ctx context.Context, actor httptransport.AdminActor) (any, error) {
			current := s.tunnel.Status()
			snapshot := s.tunnel.Stop()
			if current.URL != nil {
				family, err := s.getFamily(actor.FamilyID)
				if err == nil {
					shouldClearApp := family.PublicAppURL != nil && *family.PublicAppURL == *current.URL
					shouldClearAPI := family.PublicAPIURL != nil && *family.PublicAPIURL == *current.URL
					if shouldClearApp || shouldClearAPI {
						var appURL *string
						var apiURL *string
						if !shouldClearApp {
							appURL = family.PublicAppURL
						}
						if !shouldClearAPI {
							apiURL = family.PublicAPIURL
						}
						_ = s.publicAccess.Save(ctx, actor.FamilyID, featureadministration.PublicURLs{AppURL: appURL, APIURL: apiURL})
					}
				}
			}
			family, _ := s.getFamily(actor.FamilyID)
			return s.snapshotToTunnelStatus(snapshot, family), nil
		},
		QuickStart: func(ctx context.Context, actor httptransport.AdminActor) (any, error) {
			provider := "cloudflare"
			snapshot := s.tunnel.Start(s.backendTunnelOrigin(), provider, true)
			if snapshot.URL == nil {
				message := "Could not create public tunnel"
				if snapshot.Message != nil && strings.TrimSpace(*snapshot.Message) != "" {
					message = *snapshot.Message
				}
				return nil, httptransport.AdminHTTPError{Status: http.StatusBadGateway, Detail: message}
			}
			publicURL := strings.TrimRight(*snapshot.URL, "/")
			validationMessage := snapshot.Message
			if err := s.validatePublicBackendURL(publicURL); err != nil {
				message := "Public tunnel started. The public DNS/edge may need a few seconds before health check succeeds: " + err.Error()
				validationMessage = &message
			}
			if err := s.saveFamilyPublicURLs(ctx, actor.FamilyID, publicURL, publicURL); err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not save public access"}
			}
			family, err := s.getFamily(actor.FamilyID)
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not load family"}
			}
			inviteLinks, err := s.createPublicInviteLinks(ctx, user, family)
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not create invite links"}
			}
			settings := publicAccessSettingsForFamily(family, s.cfg.AppURL, s.cfg.APIURL)
			return quickStartPublicAccessResponse{
				Status:       snapshot.State,
				Provider:     provider,
				PublicURL:    publicURL,
				Origin:       snapshot.Origin,
				Message:      validationMessage,
				PublicAccess: settings,
				InviteLinks:  inviteLinks,
			}, nil
		},
		PublicIPQuickStart: func(ctx context.Context, actor httptransport.AdminActor) (any, error) {
			publicIP, err := detectPublicIPv4()
			if err != nil {
				return publicIPQuickStartResponse{
					Status: "blocked",
					Problems: []string{
						"Could not detect your public IP address.",
					},
					RecommendedActions: []string{
						"Use Cloudflare Tunnel for one-click access.",
					},
					CanUseCloudflareTunnel: true,
				}, nil
			}
			publicURL := "http://" + publicIP + ":8000"
			if !s.checkLocalBackendHealth() {
				return publicIPQuickStartResponse{
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
				}, nil
			}
			externalOK, externalDetail := s.checkPublicURLFromOutside(publicURL + "/api/health")
			if !externalOK {
				return publicIPQuickStartResponse{
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
				}, nil
			}
			if err := s.saveFamilyPublicURLs(ctx, actor.FamilyID, publicURL, publicURL); err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not save public IP access"}
			}
			family, err := s.getFamily(actor.FamilyID)
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not load family"}
			}
			inviteLinks, err := s.createPublicInviteLinks(ctx, user, family)
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not create invite links"}
			}
			settings := publicAccessSettingsForFamily(family, s.cfg.AppURL, s.cfg.APIURL)
			return publicIPQuickStartResponse{
				Status:                 "ready",
				PublicIP:               publicIP,
				PublicURL:              publicURL,
				PublicAccess:           &settings,
				InviteLinks:            inviteLinks,
				Problems:               []string{},
				RecommendedActions:     []string{},
				CanUseCloudflareTunnel: true,
			}, nil
		},
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
	return s.publicAccess.Save(ctx, familyID, featureadministration.PublicURLs{AppURL: &appURL, APIURL: &apiURL})
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

	err = s.familyInvites.Create(ctx, featurefamily.InviteCreate{
		ID:        inviteID,
		FamilyID:  user.FamilyID,
		TokenHash: tokenHash(s.cfg.InviteTokenSecret, rawToken),
		Role:      role,
		ExpiresAt: expiresAt,
		MaxUses:   maxUses,
		CreatedBy: user.ID,
		CreatedAt: nowString(),
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
		State:                  snapshot.State,
		Provider:               snapshot.Provider,
		URL:                    snapshot.URL,
		Origin:                 snapshot.Origin,
		Message:                snapshot.Message,
		Logs:                   snapshot.Logs,
		AutoRestart:            snapshot.AutoRestart,
		Restarts:               snapshot.Restarts,
		LastRestartReason:      snapshot.LastRestartReason,
		HealthStatus:           snapshot.HealthStatus,
		LastHealthCheckAt:      snapshot.LastHealthCheckAt,
		LastHealthError:        snapshot.LastHealthError,
		HealthFailureStreak:    snapshot.HealthFailureStreak,
		HealthFailureThreshold: snapshot.HealthFailureThreshold,
		PublicAccess:           &settings,
	}
}

func (s *Server) syncFamilyPublicURLsFromTunnelSnapshot(ctx context.Context, familyID string, snapshot tunnel.Snapshot, family familyPublic) {
	if snapshot.State != "running" || snapshot.URL == nil || snapshot.Provider == nil {
		return
	}
	publicURL := strings.TrimRight(strings.TrimSpace(*snapshot.URL), "/")
	if publicURL == "" {
		return
	}
	needsUpdate := family.PublicAppURL == nil || family.PublicAPIURL == nil ||
		*family.PublicAppURL != publicURL || *family.PublicAPIURL != publicURL
	if !needsUpdate {
		return
	}
	_ = s.saveFamilyPublicURLs(ctx, familyID, publicURL, publicURL)
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
