package http

import (
	"context"
	"errors"
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
	ChatID           string          `json:"chat_id"`
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
	if offer.ClientID != parameters.ClientID || offer.RedirectURI != parameters.RedirectURI || len(offer.Chats) == 0 || len(offer.Grants) != 6 {
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
	cookieName, cookiePath := browserCookieForSessionRequest(h.config.BrowserAppURL, request.Flow)
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
	if err := r.ParseForm(); err != nil || len(r.PostForm) != 13 {
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
			clearIntelligenceBrowserCookie(w, h.config.BrowserAppURL, intelligenceSourceV2BrowserCookieName, intelligenceSourceV2BrowserCookiePath(h.config.BrowserAppURL))
		}
		writeSourceV2ConsentOperationError(w, err)
		return
	}
	clearIntelligenceBrowserCookie(w, h.config.BrowserAppURL, intelligenceSourceV2BrowserCookieName, intelligenceSourceV2BrowserCookiePath(h.config.BrowserAppURL))
	redirectIntelligenceAuthorization(w, r, result, parameters.RedirectURI, parameters.State)
}
