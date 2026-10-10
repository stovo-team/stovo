package http

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"mime"
	stdhttp "net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

const intelligenceSourceV2ConsentMaxBodyBytes = 8 << 10

var (
	ErrIntelligenceSourceV2ConsentInvalidRequest = errors.New("intelligence source v2 consent invalid request")
	ErrIntelligenceSourceV2ConsentInvalidClient  = errors.New("intelligence source v2 consent invalid client")
	ErrIntelligenceSourceV2ConsentUnauthorized   = errors.New("intelligence source v2 consent unauthorized")
	ErrIntelligenceSourceV2ConsentForbidden      = errors.New("intelligence source v2 consent forbidden")
	ErrIntelligenceSourceV2ConsentNotFound       = errors.New("intelligence source v2 consent not found")
	ErrIntelligenceSourceV2ConsentRateLimited    = errors.New("intelligence source v2 consent rate limited")
	ErrIntelligenceSourceV2ConsentUnavailable    = errors.New("intelligence source v2 consent unavailable")
)

type IntelligenceSourceV2ConsentPrincipal struct {
	UserID   string
	FamilyID string
}

type IntelligenceSourceV2ConsentParameters struct {
	ResponseType        string `json:"response_type,omitempty"`
	ClientID            string `json:"client_id"`
	RedirectURI         string `json:"redirect_uri"`
	State               string `json:"state"`
	CodeChallenge       string `json:"code_challenge"`
	CodeChallengeMethod string `json:"code_challenge_method"`
}

type IntelligenceSourceV2ConsentChat struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Type  string `json:"type"`
}

type IntelligenceSourceV2ConsentOffer struct {
	ClientID    string                            `json:"client_id"`
	RedirectURI string                            `json:"redirect_uri"`
	State       string                            `json:"state"`
	Chats       []IntelligenceSourceV2ConsentChat `json:"chats"`
	Grants      map[string]bool                   `json:"grants"`
}

type IntelligenceSourceV2ConsentRequest struct {
	IntelligenceSourceV2ConsentParameters
	ChatID string          `json:"chat_id"`
	Grants map[string]bool `json:"grants"`
}

type IntelligenceSourceV2ConsentRedirect struct {
	RedirectURI string
	Code        string
	State       string
}

type IntelligenceBrowserSessionRequest struct {
	Flow                string          `json:"flow"`
	ResponseType        string          `json:"response_type"`
	ClientID            string          `json:"client_id"`
	RedirectURI         string          `json:"redirect_uri"`
	State               string          `json:"state"`
	Nonce               string          `json:"nonce,omitempty"`
	CodeChallenge       string          `json:"code_challenge"`
	CodeChallengeMethod string          `json:"code_challenge_method"`
	ChatID              string          `json:"chat_id,omitempty"`
	Grants              map[string]bool `json:"grants,omitempty"`
}

type IntelligenceBrowserSessionTicket struct {
	Value     string
	ExpiresIn int64
}

type IntelligenceSourceV2ConnectionSummary struct {
	ID        string          `json:"id"`
	ChatID    string          `json:"chat_id"`
	ChatTitle string          `json:"chat_title"`
	Grants    map[string]bool `json:"grants"`
	CreatedAt time.Time       `json:"created_at"`
	ExpiresAt time.Time       `json:"expires_at"`
	RevokedAt *time.Time      `json:"revoked_at"`
}

type IntelligenceSourceV2CredentialResponse struct {
	ConnectionID     string          `json:"connection_id"`
	SourceCredential string          `json:"source_credential"`
	TokenType        string          `json:"token_type"`
	ExpiresIn        int64           `json:"expires_in"`
	Grants           map[string]bool `json:"grants"`
}

type IntelligenceSourceV2ConsentOperations struct {
	Offer                func(context.Context, *stdhttp.Request, IntelligenceSourceV2ConsentPrincipal, IntelligenceSourceV2ConsentParameters) (IntelligenceSourceV2ConsentOffer, error)
	Authorize            func(context.Context, *stdhttp.Request, IntelligenceSourceV2ConsentPrincipal, IntelligenceSourceV2ConsentRequest) (IntelligenceSourceV2ConsentRedirect, error)
	CreateBrowserSession func(context.Context, *stdhttp.Request, IntelligenceSourceV2ConsentPrincipal, IntelligenceBrowserSessionRequest) (IntelligenceBrowserSessionTicket, error)
	AuthorizeBrowser     func(context.Context, *stdhttp.Request, string, IntelligenceSourceV2ConsentRequest) (IntelligenceSourceV2ConsentRedirect, error)
	Exchange             func(context.Context, *stdhttp.Request, string, string, string, string, string) (IntelligenceSourceV2CredentialResponse, error)
	Rotate               func(context.Context, *stdhttp.Request, string, string, string, string, string) (IntelligenceSourceV2CredentialResponse, error)
	Revoke               func(context.Context, *stdhttp.Request, IntelligenceSourceV2ConsentPrincipal, string, string) error
	ListConnections      func(context.Context, *stdhttp.Request, IntelligenceSourceV2ConsentPrincipal) ([]IntelligenceSourceV2ConnectionSummary, error)
}

type IntelligenceSourceV2ConsentHandlerConfig struct {
	Authenticate  func(*stdhttp.Request) (IntelligenceSourceV2ConsentPrincipal, error)
	Operations    IntelligenceSourceV2ConsentOperations
	BrowserAppURL string
	Timeout       time.Duration
}

// NewIntelligenceSourceV2ConsentHandler owns browser consent, server-to-server
// code exchange, and user-authorized revocation. Its source bearer is never
// accepted by the OIDC handler or returned on a browser redirect.
func NewIntelligenceSourceV2ConsentHandler(config IntelligenceSourceV2ConsentHandlerConfig) stdhttp.Handler {
	if config.Timeout <= 0 {
		config.Timeout = 5 * time.Second
	}
	handler := &IntelligenceSourceV2ConsentHandler{config: config}
	router := chi.NewRouter()
	router.Get("/authorize", handler.offer)
	router.Post("/authorize", handler.authorize)
	router.Post("/authorize-session", handler.createBrowserSession)
	router.Get("/connections", handler.connections)
	router.Post("/token", handler.token)
	router.Post("/revoke", handler.revoke)
	return router
}

type IntelligenceSourceV2ConsentHandler struct {
	config IntelligenceSourceV2ConsentHandlerConfig
}

func (h *IntelligenceSourceV2ConsentHandler) offer(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	setSourceV2ConsentNoStore(w)
	if r.Header.Get("Authorization") == "" && wantsBrowserHTML(r) {
		_, valid := parseSourceV2ConsentParameters(r.URL.Query())
		if !valid {
			writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "invalid_request")
			return
		}
		query := make(url.Values)
		for key, values := range r.URL.Query() {
			query[key] = append([]string(nil), values...)
		}
		query.Set("response_type", "code")
		location, err := intelligenceBrowserConsentPage(h.config.BrowserAppURL, "source_v2", query)
		if err != nil {
			writeSourceV2ConsentError(w, stdhttp.StatusServiceUnavailable, "server_error")
			return
		}
		w.Header().Set("Referrer-Policy", "no-referrer")
		stdhttp.Redirect(w, r, location, stdhttp.StatusFound)
		return
	}
	principal, ok := h.authenticate(w, r)
	if !ok {
		return
	}
	parameters, valid := parseSourceV2ConsentParameters(r.URL.Query())
	if !valid || h.config.Operations.Offer == nil {
		writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "invalid_request")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), h.config.Timeout)
	defer cancel()
	offer, err := h.config.Operations.Offer(ctx, r, principal, parameters)
	if err != nil {
		writeSourceV2ConsentOperationError(w, err)
		return
	}
	if offer.ClientID != parameters.ClientID || offer.RedirectURI != parameters.RedirectURI || len(offer.Chats) == 0 || len(offer.Grants) != 4 {
		writeSourceV2ConsentError(w, stdhttp.StatusServiceUnavailable, "server_error")
		return
	}
	writeSourceV2ConsentJSON(w, stdhttp.StatusOK, offer)
}

func (h *IntelligenceSourceV2ConsentHandler) authorize(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	setSourceV2ConsentNoStore(w)
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if strings.EqualFold(mediaType, "application/x-www-form-urlencoded") {
		h.authorizeBrowser(w, r)
		return
	}
	principal, ok := h.authenticate(w, r)
	if !ok {
		return
	}
	var request IntelligenceSourceV2ConsentRequest
	if err := decodeSourceV2ConsentJSON(w, r, &request); err != nil {
		writeSourceV2ConsentOperationError(w, ErrIntelligenceSourceV2ConsentInvalidRequest)
		return
	}
	if !validSourceV2ConsentParameters(request.IntelligenceSourceV2ConsentParameters) || strings.TrimSpace(request.ChatID) == "" || len(request.ChatID) > 256 || !validSourceV2ConsentGrants(request.Grants) || h.config.Operations.Authorize == nil {
		writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "invalid_request")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), h.config.Timeout)
	defer cancel()
	result, err := h.config.Operations.Authorize(ctx, r, principal, request)
	if err != nil {
		writeSourceV2ConsentOperationError(w, err)
		return
	}
	if result.Code == "" || result.State != request.State || result.RedirectURI != request.RedirectURI {
		writeSourceV2ConsentError(w, stdhttp.StatusServiceUnavailable, "server_error")
		return
	}
	callback, err := url.ParseRequestURI(result.RedirectURI)
	if err != nil || callback.Scheme != "https" || callback.Host == "" || callback.Fragment != "" {
		writeSourceV2ConsentError(w, stdhttp.StatusServiceUnavailable, "server_error")
		return
	}
	query := callback.Query()
	query.Set("code", result.Code)
	query.Set("state", result.State)
	callback.RawQuery = query.Encode()
	w.Header().Set("Referrer-Policy", "no-referrer")
	stdhttp.Redirect(w, r, callback.String(), stdhttp.StatusFound)
}

func (h *IntelligenceSourceV2ConsentHandler) createBrowserSession(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	setSourceV2ConsentNoStore(w)
	principal, ok := h.authenticate(w, r)
	if !ok {
		return
	}
	var request IntelligenceBrowserSessionRequest
	if err := decodeSourceV2ConsentJSON(w, r, &request); err != nil || !validIntelligenceBrowserSessionRequest(request) || h.config.Operations.CreateBrowserSession == nil {
		writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "invalid_request")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), h.config.Timeout)
	defer cancel()
	ticket, err := h.config.Operations.CreateBrowserSession(ctx, r, principal, request)
	if err != nil {
		if request.Flow == "oidc" {
			writeOIDCOperationError(w, err)
		} else {
			writeSourceV2ConsentOperationError(w, err)
		}
		return
	}
	if ticket.Value == "" || ticket.ExpiresIn <= 0 || ticket.ExpiresIn > intelligenceBrowserSessionLifetimeSeconds {
		writeSourceV2ConsentError(w, stdhttp.StatusServiceUnavailable, "server_error")
		return
	}
	cookieName, cookiePath := browserCookieForSessionRequest(r, request.Flow)
	setIntelligenceBrowserCookie(w, h.config.BrowserAppURL, cookieName, cookiePath, ticket.Value)
	writeSourceV2ConsentJSON(w, stdhttp.StatusOK, map[string]int64{"expires_in": ticket.ExpiresIn})
}

func (h *IntelligenceSourceV2ConsentHandler) authorizeBrowser(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	if r.URL.RawQuery != "" || r.Body == nil || r.ContentLength > intelligenceSourceV2ConsentMaxBodyBytes || h.config.Operations.AuthorizeBrowser == nil {
		writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "invalid_request")
		return
	}
	mediaType, _, mediaErr := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaErr != nil || !strings.EqualFold(mediaType, "application/x-www-form-urlencoded") {
		writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "invalid_request")
		return
	}
	expectedOrigin := normalizeConfiguredOrigin(h.config.BrowserAppURL)
	if expectedOrigin == "" || normalizeRequestOrigin(r.Header.Get("Origin")) != expectedOrigin {
		writeSourceV2ConsentError(w, stdhttp.StatusForbidden, "access_denied")
		return
	}
	r.Body = stdhttp.MaxBytesReader(w, r.Body, intelligenceSourceV2ConsentMaxBodyBytes)
	if err := r.ParseForm(); err != nil || len(r.PostForm) != 11 {
		writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "invalid_request")
		return
	}
	responseType, a := singleFormValue(r.PostForm, "response_type")
	clientID, b := singleFormValue(r.PostForm, "client_id")
	redirectURI, c := singleFormValue(r.PostForm, "redirect_uri")
	state, d := singleFormValue(r.PostForm, "state")
	challenge, e := singleFormValue(r.PostForm, "code_challenge")
	method, f := singleFormValue(r.PostForm, "code_challenge_method")
	chatID, g := singleFormValue(r.PostForm, "chat_id")
	parameters := IntelligenceSourceV2ConsentParameters{ResponseType: responseType, ClientID: clientID, RedirectURI: redirectURI, State: state, CodeChallenge: challenge, CodeChallengeMethod: method}
	request := IntelligenceSourceV2ConsentRequest{IntelligenceSourceV2ConsentParameters: parameters, ChatID: chatID, Grants: make(map[string]bool, len(intelligenceSourceV2GrantFormFields))}
	valid := a && b && c && d && e && f && g && responseType == "code"
	for grant := range intelligenceSourceV2GrantFormFields {
		value, found := singleFormValue(r.PostForm, grant)
		if !found || (value != "true" && value != "false") {
			valid = false
			continue
		}
		request.Grants[grant] = value == "true"
	}
	if !valid || !validSourceV2ConsentParameters(parameters) || strings.TrimSpace(chatID) == "" || len(chatID) > 256 {
		writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "invalid_request")
		return
	}
	cookie, err := r.Cookie(intelligenceSourceV2BrowserCookieName)
	if err != nil || cookie.Value == "" {
		writeSourceV2ConsentError(w, stdhttp.StatusUnauthorized, "login_required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), h.config.Timeout)
	defer cancel()
	result, err := h.config.Operations.AuthorizeBrowser(ctx, r, cookie.Value, request)
	if err != nil {
		if errors.Is(err, ErrIntelligenceSourceV2ConsentUnauthorized) {
			clearIntelligenceBrowserCookie(w, h.config.BrowserAppURL, intelligenceSourceV2BrowserCookieName, r.URL.Path)
		}
		writeSourceV2ConsentOperationError(w, err)
		return
	}
	clearIntelligenceBrowserCookie(w, h.config.BrowserAppURL, intelligenceSourceV2BrowserCookieName, r.URL.Path)
	redirectIntelligenceAuthorization(w, r, result, parameters.RedirectURI, parameters.State)
}

var intelligenceSourceV2GrantFormFields = map[string]struct{}{
	"read": {}, "process": {}, "external_transfer": {}, "export": {},
}

func (h *IntelligenceSourceV2ConsentHandler) connections(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	setSourceV2ConsentNoStore(w)
	principal, ok := h.authenticate(w, r)
	if !ok {
		return
	}
	if h.config.Operations.ListConnections == nil {
		writeSourceV2ConsentError(w, stdhttp.StatusServiceUnavailable, "server_error")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), h.config.Timeout)
	defer cancel()
	connections, err := h.config.Operations.ListConnections(ctx, r, principal)
	if err != nil {
		writeSourceV2ConsentOperationError(w, err)
		return
	}
	if connections == nil {
		connections = []IntelligenceSourceV2ConnectionSummary{}
	}
	writeSourceV2ConsentJSON(w, stdhttp.StatusOK, map[string]any{"connections": connections})
}

func (h *IntelligenceSourceV2ConsentHandler) token(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	setSourceV2ConsentNoStore(w)
	if r.URL.RawQuery != "" || r.Body == nil || r.ContentLength > intelligenceSourceV2ConsentMaxBodyBytes {
		writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "invalid_request")
		return
	}
	mediaType, _, mediaTypeErr := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaTypeErr != nil || !strings.EqualFold(mediaType, "application/x-www-form-urlencoded") {
		writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "invalid_request")
		return
	}
	r.Body = stdhttp.MaxBytesReader(w, r.Body, intelligenceSourceV2ConsentMaxBodyBytes)
	if err := r.ParseForm(); err != nil || len(r.PostForm) != 4 {
		writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "invalid_request")
		return
	}
	grantType, grantTypeOK := singleFormValue(r.PostForm, "grant_type")
	redirectURI, redirectOK := singleFormValue(r.PostForm, "redirect_uri")
	clientID, clientSecret, basicAuth := r.BasicAuth()
	if !grantTypeOK || !redirectOK || !basicAuth || len(r.Header.Values("Authorization")) != 1 || clientID == "" || clientSecret == "" || r.PostForm.Has("client_id") || r.PostForm.Has("client_secret") {
		writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "invalid_request")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), h.config.Timeout)
	defer cancel()
	var credential IntelligenceSourceV2CredentialResponse
	var err error
	switch grantType {
	case "authorization_code":
		code, codeOK := singleFormValue(r.PostForm, "code")
		verifier, verifierOK := singleFormValue(r.PostForm, "code_verifier")
		if !codeOK || !verifierOK || len(r.PostForm) != 4 || h.config.Operations.Exchange == nil {
			writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "invalid_request")
			return
		}
		credential, err = h.config.Operations.Exchange(ctx, r, clientID, clientSecret, code, redirectURI, verifier)
	case "urn:stovo:intelligence:source-credential-rotation":
		sourceCredential, credentialOK := singleFormValue(r.PostForm, "source_credential")
		connectionID, connectionOK := singleFormValue(r.PostForm, "connection_id")
		if !credentialOK || !connectionOK || len(r.PostForm) != 4 || h.config.Operations.Rotate == nil {
			writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "invalid_request")
			return
		}
		credential, err = h.config.Operations.Rotate(ctx, r, clientID, clientSecret, connectionID, sourceCredential, redirectURI)
	default:
		writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "unsupported_grant_type")
		return
	}
	if err != nil {
		writeSourceV2ConsentOperationError(w, err)
		return
	}
	if credential.ConnectionID == "" || credential.SourceCredential == "" || credential.TokenType != "Bearer" || credential.ExpiresIn <= 0 || len(credential.Grants) != 4 {
		writeSourceV2ConsentError(w, stdhttp.StatusServiceUnavailable, "server_error")
		return
	}
	writeSourceV2ConsentJSON(w, stdhttp.StatusOK, credential)
}

func (h *IntelligenceSourceV2ConsentHandler) revoke(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	setSourceV2ConsentNoStore(w)
	principal, ok := h.authenticate(w, r)
	if !ok {
		return
	}
	var request struct {
		ConnectionID string `json:"connection_id"`
		Grant        string `json:"grant"`
	}
	if err := decodeSourceV2ConsentJSON(w, r, &request); err != nil || strings.TrimSpace(request.ConnectionID) == "" || len(request.ConnectionID) > 256 || (request.Grant != "" && request.Grant != "connection" && !validSourceV2ConsentGrant(request.Grant)) || h.config.Operations.Revoke == nil {
		writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "invalid_request")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), h.config.Timeout)
	defer cancel()
	grant := request.Grant
	if grant == "connection" {
		grant = ""
	}
	if err := h.config.Operations.Revoke(ctx, r, principal, request.ConnectionID, grant); err != nil {
		writeSourceV2ConsentOperationError(w, err)
		return
	}
	writeSourceV2ConsentJSON(w, stdhttp.StatusOK, map[string]bool{"revoked": true})
}

func (h *IntelligenceSourceV2ConsentHandler) authenticate(w stdhttp.ResponseWriter, r *stdhttp.Request) (IntelligenceSourceV2ConsentPrincipal, bool) {
	if h.config.Authenticate == nil {
		writeSourceV2ConsentError(w, stdhttp.StatusServiceUnavailable, "server_error")
		return IntelligenceSourceV2ConsentPrincipal{}, false
	}
	principal, err := h.config.Authenticate(r)
	if err != nil || principal.UserID == "" || principal.FamilyID == "" {
		writeSourceV2ConsentError(w, stdhttp.StatusUnauthorized, "login_required")
		return IntelligenceSourceV2ConsentPrincipal{}, false
	}
	return principal, true
}

func parseSourceV2ConsentParameters(values url.Values) (IntelligenceSourceV2ConsentParameters, bool) {
	if len(values) != 5 && len(values) != 6 {
		return IntelligenceSourceV2ConsentParameters{}, false
	}
	responseType := ""
	if len(values) == 6 {
		var ok bool
		responseType, ok = singleFormValue(values, "response_type")
		if !ok || responseType != "code" {
			return IntelligenceSourceV2ConsentParameters{}, false
		}
	}
	clientID, a := singleFormValue(values, "client_id")
	redirectURI, b := singleFormValue(values, "redirect_uri")
	state, c := singleFormValue(values, "state")
	challenge, d := singleFormValue(values, "code_challenge")
	method, e := singleFormValue(values, "code_challenge_method")
	parameters := IntelligenceSourceV2ConsentParameters{ResponseType: responseType, ClientID: clientID, RedirectURI: redirectURI, State: state, CodeChallenge: challenge, CodeChallengeMethod: method}
	return parameters, a && b && c && d && e && validSourceV2ConsentParameters(parameters)
}

func validSourceV2ConsentParameters(parameters IntelligenceSourceV2ConsentParameters) bool {
	return (parameters.ResponseType == "" || parameters.ResponseType == "code") && parameters.ClientID != "" && len(parameters.ClientID) <= 256 && parameters.RedirectURI != "" && len(parameters.RedirectURI) <= 2048 && validSourceV2ConsentString(parameters.State, 512) && parameters.CodeChallengeMethod == "S256" && validSourceV2ConsentChallenge(parameters.CodeChallenge)
}

func validSourceV2ConsentString(value string, max int) bool {
	if value == "" || len(value) > max || strings.TrimSpace(value) != value {
		return false
	}
	for _, char := range value {
		if char < 0x21 || char == 0x7f {
			return false
		}
	}
	return true
}

func validSourceV2ConsentChallenge(value string) bool {
	if len(value) != 43 {
		return false
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	return err == nil && len(decoded) == sha256.Size && base64.RawURLEncoding.EncodeToString(decoded) == value
}

func validSourceV2ConsentGrant(grant string) bool {
	switch grant {
	case "read", "process", "external_transfer", "export":
		return true
	default:
		return false
	}
}

func validSourceV2ConsentGrants(grants map[string]bool) bool {
	for grant := range grants {
		if !validSourceV2ConsentGrant(grant) {
			return false
		}
	}
	return true
}

func decodeSourceV2ConsentJSON(w stdhttp.ResponseWriter, r *stdhttp.Request, target any) error {
	if r.URL.RawQuery != "" || r.Body == nil || r.ContentLength > intelligenceSourceV2ConsentMaxBodyBytes {
		return ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || !strings.EqualFold(mediaType, "application/json") {
		return ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	r.Body = stdhttp.MaxBytesReader(w, r.Body, intelligenceSourceV2ConsentMaxBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	return nil
}

func writeSourceV2ConsentOperationError(w stdhttp.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrIntelligenceSourceV2ConsentInvalidClient):
		w.Header().Set("WWW-Authenticate", `Basic realm="api/v2/intelligence/token"`)
		writeSourceV2ConsentError(w, stdhttp.StatusUnauthorized, "invalid_client")
	case errors.Is(err, ErrIntelligenceSourceV2ConsentUnauthorized):
		writeSourceV2ConsentError(w, stdhttp.StatusUnauthorized, "login_required")
	case errors.Is(err, ErrIntelligenceSourceV2ConsentForbidden):
		writeSourceV2ConsentError(w, stdhttp.StatusForbidden, "access_denied")
	case errors.Is(err, ErrIntelligenceSourceV2ConsentNotFound):
		writeSourceV2ConsentError(w, stdhttp.StatusNotFound, "not_found")
	case errors.Is(err, ErrIntelligenceSourceV2ConsentRateLimited):
		writeSourceV2ConsentError(w, stdhttp.StatusTooManyRequests, "rate_limited")
	case errors.Is(err, ErrIntelligenceSourceV2ConsentInvalidRequest):
		writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "invalid_request")
	default:
		writeSourceV2ConsentError(w, stdhttp.StatusServiceUnavailable, "server_error")
	}
}

func setSourceV2ConsentNoStore(w stdhttp.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
}

func writeSourceV2ConsentError(w stdhttp.ResponseWriter, status int, code string) {
	writeSourceV2ConsentJSON(w, status, map[string]string{"error": code})
}

func writeSourceV2ConsentJSON(w stdhttp.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
