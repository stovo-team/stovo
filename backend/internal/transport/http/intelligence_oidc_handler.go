package http

import (
	"context"
	"encoding/json"
	"errors"
	"mime"
	stdhttp "net/http"
	"net/url"
	"strings"
	"time"
)

const intelligenceOIDCMaxBodyBytes = 8 << 10

var (
	ErrIntelligenceOIDCInvalidRequest = errors.New("intelligence OIDC invalid request")
	ErrIntelligenceOIDCInvalidClient  = errors.New("intelligence OIDC invalid client")
	ErrIntelligenceOIDCUnauthorized   = errors.New("intelligence OIDC unauthorized")
	ErrIntelligenceOIDCRateLimited    = errors.New("intelligence OIDC rate limited")
	ErrIntelligenceOIDCUnavailable    = errors.New("intelligence OIDC unavailable")
)

type IntelligenceOIDCAuthorizationRequest struct {
	ResponseType        string
	ClientID            string
	RedirectURI         string
	State               string
	Nonce               string
	CodeChallenge       string
	CodeChallengeMethod string
}

type IntelligenceOIDCAuthorizationResult struct {
	RedirectURI string
	Code        string
	State       string
}

type IntelligenceOIDCTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int64  `json:"expires_in"`
	IDToken     string `json:"id_token"`
}

type IntelligenceOIDCOperations struct {
	ValidateAuthorization func(context.Context, *stdhttp.Request, IntelligenceOIDCAuthorizationRequest) error
	Authorize             func(context.Context, *stdhttp.Request, IntelligenceOIDCAuthorizationRequest) (IntelligenceOIDCAuthorizationResult, error)
	AuthorizeBrowser      func(context.Context, *stdhttp.Request, string, IntelligenceOIDCAuthorizationRequest) (IntelligenceOIDCAuthorizationResult, error)
	Exchange              func(context.Context, *stdhttp.Request, string, string, string, string, string) (IntelligenceOIDCTokenResponse, error)
}

type IntelligenceOIDCHandlerConfig struct {
	Enabled       bool
	BrowserAppURL string
	Discovery     any
	JWKS          any
	Operations    IntelligenceOIDCOperations
	Timeout       time.Duration
}

type IntelligenceOIDCHandler struct {
	config IntelligenceOIDCHandlerConfig
}

func NewIntelligenceOIDCHandler(config IntelligenceOIDCHandlerConfig) stdhttp.Handler {
	if config.Timeout <= 0 {
		config.Timeout = 5 * time.Second
	}
	return &IntelligenceOIDCHandler{config: config}
}

func (h *IntelligenceOIDCHandler) ServeHTTP(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	setOIDCNoStore(w)
	if !h.config.Enabled {
		writeOIDCError(w, stdhttp.StatusNotFound, "not_found")
		return
	}
	switch {
	case r.Method == stdhttp.MethodGet && r.URL.Path == "/.well-known/openid-configuration":
		if h.config.Discovery == nil {
			writeOIDCError(w, stdhttp.StatusServiceUnavailable, "server_error")
			return
		}
		writeOIDCJSON(w, stdhttp.StatusOK, h.config.Discovery)
	case r.Method == stdhttp.MethodGet && r.URL.Path == "/oauth2/jwks":
		if h.config.JWKS == nil {
			writeOIDCError(w, stdhttp.StatusServiceUnavailable, "server_error")
			return
		}
		writeOIDCJSON(w, stdhttp.StatusOK, h.config.JWKS)
	case r.Method == stdhttp.MethodGet && r.URL.Path == "/oauth2/authorize":
		h.authorize(w, r)
	case r.Method == stdhttp.MethodPost && r.URL.Path == "/oauth2/token":
		h.token(w, r)
	default:
		w.Header().Set("Allow", "GET, POST")
		writeOIDCError(w, stdhttp.StatusMethodNotAllowed, "invalid_request")
	}
}

func (h *IntelligenceOIDCHandler) authorize(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	request, ok := parseOIDCAuthorizationRequest(r.URL.Query())
	if !ok {
		writeOIDCError(w, stdhttp.StatusBadRequest, "invalid_request")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), h.config.Timeout)
	defer cancel()
	var result IntelligenceOIDCAuthorizationResult
	var err error
	if r.Header.Get("Authorization") == "" {
		cookie, cookieErr := r.Cookie(intelligenceOIDCBrowserCookieName)
		if cookieErr != nil || cookie.Value == "" {
			if h.config.Operations.ValidateAuthorization != nil {
				if err := h.config.Operations.ValidateAuthorization(ctx, r, request); err != nil {
					writeOIDCOperationError(w, err)
					return
				}
			}
			location, locationErr := intelligenceBrowserConsentPage(h.config.BrowserAppURL, "oidc", r.URL.Query())
			if locationErr != nil {
				writeOIDCError(w, stdhttp.StatusServiceUnavailable, "server_error")
				return
			}
			w.Header().Set("Referrer-Policy", "no-referrer")
			stdhttp.Redirect(w, r, location, stdhttp.StatusFound)
			return
		}
		if h.config.Operations.AuthorizeBrowser == nil {
			writeOIDCError(w, stdhttp.StatusUnauthorized, "login_required")
			return
		}
		result, err = h.config.Operations.AuthorizeBrowser(ctx, r, cookie.Value, request)
		if err == nil || errors.Is(err, ErrIntelligenceOIDCUnauthorized) {
			clearIntelligenceBrowserCookie(w, h.config.BrowserAppURL, intelligenceOIDCBrowserCookieName, "/oauth2/authorize")
		}
	} else {
		if h.config.Operations.Authorize == nil {
			writeOIDCError(w, stdhttp.StatusServiceUnavailable, "server_error")
			return
		}
		result, err = h.config.Operations.Authorize(ctx, r, request)
	}
	if err != nil {
		writeOIDCOperationError(w, err)
		return
	}
	redirect := IntelligenceSourceV2ConsentRedirect{RedirectURI: result.RedirectURI, Code: result.Code, State: result.State}
	if !redirectIntelligenceAuthorization(w, r, redirect, request.RedirectURI, request.State) {
		writeOIDCError(w, stdhttp.StatusServiceUnavailable, "server_error")
		return
	}
}

func (h *IntelligenceOIDCHandler) token(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	if r.URL.RawQuery != "" || r.Body == nil || r.ContentLength > intelligenceOIDCMaxBodyBytes {
		writeOIDCError(w, stdhttp.StatusBadRequest, "invalid_request")
		return
	}
	mediaType, _, mediaTypeErr := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaTypeErr != nil || !strings.EqualFold(mediaType, "application/x-www-form-urlencoded") {
		writeOIDCError(w, stdhttp.StatusBadRequest, "invalid_request")
		return
	}
	r.Body = stdhttp.MaxBytesReader(w, r.Body, intelligenceOIDCMaxBodyBytes)
	if err := r.ParseForm(); err != nil || len(r.PostForm) == 0 {
		writeOIDCError(w, stdhttp.StatusBadRequest, "invalid_request")
		return
	}
	grantType, grantOK := singleFormValue(r.PostForm, "grant_type")
	code, codeOK := singleFormValue(r.PostForm, "code")
	redirectURI, redirectOK := singleFormValue(r.PostForm, "redirect_uri")
	verifier, verifierOK := singleFormValue(r.PostForm, "code_verifier")
	clientID, clientSecret, basicAuth := r.BasicAuth()
	if !grantOK || grantType != "authorization_code" || !codeOK || !redirectOK || !verifierOK || !basicAuth || len(r.Header.Values("Authorization")) != 1 || clientID == "" || clientSecret == "" || r.PostForm.Has("client_id") || r.PostForm.Has("client_secret") || len(r.PostForm) != 4 {
		writeOIDCError(w, stdhttp.StatusBadRequest, "invalid_request")
		return
	}
	if h.config.Operations.Exchange == nil {
		writeOIDCError(w, stdhttp.StatusServiceUnavailable, "server_error")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), h.config.Timeout)
	defer cancel()
	tokens, err := h.config.Operations.Exchange(ctx, r, clientID, clientSecret, code, redirectURI, verifier)
	if err != nil {
		writeOIDCOperationError(w, err)
		return
	}
	if tokens.AccessToken == "" || tokens.TokenType != "Bearer" || tokens.ExpiresIn <= 0 || tokens.IDToken == "" || tokens.AccessToken == tokens.IDToken {
		writeOIDCError(w, stdhttp.StatusServiceUnavailable, "server_error")
		return
	}
	writeOIDCJSON(w, stdhttp.StatusOK, tokens)
}

func parseOIDCAuthorizationRequest(query url.Values) (IntelligenceOIDCAuthorizationRequest, bool) {
	if len(query) != 7 {
		return IntelligenceOIDCAuthorizationRequest{}, false
	}
	responseType, a := singleFormValue(query, "response_type")
	clientID, b := singleFormValue(query, "client_id")
	redirectURI, c := singleFormValue(query, "redirect_uri")
	state, d := singleFormValue(query, "state")
	nonce, e := singleFormValue(query, "nonce")
	challenge, f := singleFormValue(query, "code_challenge")
	challengeMethod, g := singleFormValue(query, "code_challenge_method")
	if !a || !b || !c || !d || !e || !f || !g {
		return IntelligenceOIDCAuthorizationRequest{}, false
	}
	return IntelligenceOIDCAuthorizationRequest{ResponseType: responseType, ClientID: clientID, RedirectURI: redirectURI, State: state, Nonce: nonce, CodeChallenge: challenge, CodeChallengeMethod: challengeMethod}, true
}

func singleFormValue(values url.Values, key string) (string, bool) {
	entries, ok := values[key]
	if !ok || len(entries) != 1 || strings.TrimSpace(entries[0]) == "" {
		return "", false
	}
	return entries[0], true
}

func writeOIDCOperationError(w stdhttp.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrIntelligenceOIDCInvalidClient):
		w.Header().Set("WWW-Authenticate", `Basic realm="oauth2/token"`)
		writeOIDCError(w, stdhttp.StatusUnauthorized, "invalid_client")
	case errors.Is(err, ErrIntelligenceOIDCUnauthorized):
		writeOIDCError(w, stdhttp.StatusUnauthorized, "login_required")
	case errors.Is(err, ErrIntelligenceOIDCRateLimited):
		writeOIDCError(w, stdhttp.StatusTooManyRequests, "rate_limited")
	case errors.Is(err, ErrIntelligenceOIDCInvalidRequest):
		writeOIDCError(w, stdhttp.StatusBadRequest, "invalid_request")
	default:
		writeOIDCError(w, stdhttp.StatusServiceUnavailable, "server_error")
	}
}

func setOIDCNoStore(w stdhttp.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
}

func writeOIDCError(w stdhttp.ResponseWriter, status int, code string) {
	writeOIDCJSON(w, status, map[string]string{"error": code})
}

func writeOIDCJSON(w stdhttp.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
