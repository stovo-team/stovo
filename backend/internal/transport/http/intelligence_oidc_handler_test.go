package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"testing"
)

type oidcRouteTestLogger struct{}

func (oidcRouteTestLogger) Infof(string, string, ...any) {}

func fillRouteHandlers(value reflect.Value, handler http.Handler) {
	handlerType := reflect.TypeOf((*http.Handler)(nil)).Elem()
	for index := 0; index < value.NumField(); index++ {
		field := value.Field(index)
		switch {
		case field.Kind() == reflect.Interface && field.Type().Implements(handlerType) && field.CanSet():
			field.Set(reflect.ValueOf(handler))
		case field.Kind() == reflect.Struct && field.CanSet():
			fillRouteHandlers(field, handler)
		}
	}
}

func TestIntelligenceOIDCRoutesAreReservedBeforeFrontendFallback(t *testing.T) {
	oidc := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Route-Owner", "oidc")
		w.WriteHeader(http.StatusNoContent)
	})
	fallback := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-Route-Owner", "frontend")
		w.WriteHeader(http.StatusTeapot)
	})
	routes := RouteComposition{IntelligenceOIDC: oidc, FrontendFallback: fallback, Logger: oidcRouteTestLogger{}}
	fillRouteHandlers(reflect.ValueOf(&routes).Elem(), oidc)
	routes.IntelligenceOIDC = oidc
	routes.FrontendFallback = fallback
	router := NewRouter(routes)
	for _, endpoint := range []struct{ method, path string }{
		{http.MethodGet, "/.well-known/openid-configuration"},
		{http.MethodGet, "/oauth2/authorize"},
		{http.MethodPost, "/oauth2/token"},
		{http.MethodGet, "/oauth2/jwks"},
	} {
		t.Run(endpoint.method+" "+endpoint.path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(endpoint.method, endpoint.path, nil)
			router.ServeHTTP(recorder, request)
			if recorder.Code != http.StatusNoContent || recorder.Header().Get("X-Route-Owner") != "oidc" {
				t.Fatalf("OIDC route fell through or was not mounted: status=%d owner=%q", recorder.Code, recorder.Header().Get("X-Route-Owner"))
			}
		})
	}
}

func TestIntelligenceOIDCHandlerPublishesNoStoreDiscoveryAndJWKS(t *testing.T) {
	handler := NewIntelligenceOIDCHandler(IntelligenceOIDCHandlerConfig{
		Enabled:   true,
		Discovery: map[string]any{"issuer": "https://messenger.example", "response_types_supported": []string{"code"}},
		JWKS:      map[string]any{"keys": []map[string]string{{"kty": "RSA", "kid": "synthetic-key", "alg": "RS256"}}},
	})
	for _, path := range []string{"/.well-known/openid-configuration", "/oauth2/jwks"} {
		t.Run(path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
			if recorder.Code != http.StatusOK || recorder.Header().Get("Cache-Control") != "no-store" || recorder.Header().Get("Pragma") != "no-cache" {
				t.Fatalf("OIDC public endpoint status=%d cache=%q pragma=%q body=%s", recorder.Code, recorder.Header().Get("Cache-Control"), recorder.Header().Get("Pragma"), recorder.Body.String())
			}
			var payload map[string]any
			if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil || len(payload) == 0 {
				t.Fatalf("OIDC endpoint returned invalid JSON: err=%v body=%s", err, recorder.Body.String())
			}
		})
	}
}

func TestIntelligenceOIDCHandlerBindsCodeExchangeToConfidentialClient(t *testing.T) {
	var authorizeInput IntelligenceOIDCAuthorizationRequest
	var exchangeCall struct{ clientID, clientSecret, code, redirectURI, verifier string }
	handler := NewIntelligenceOIDCHandler(IntelligenceOIDCHandlerConfig{
		Enabled: true,
		Operations: IntelligenceOIDCOperations{
			Authorize: func(_ context.Context, request *http.Request, input IntelligenceOIDCAuthorizationRequest) (IntelligenceOIDCAuthorizationResult, error) {
				if request.Header.Get("Authorization") != "Bearer synthetic-session" {
					t.Fatalf("authorize session header=%q", request.Header.Get("Authorization"))
				}
				authorizeInput = input
				return IntelligenceOIDCAuthorizationResult{RedirectURI: input.RedirectURI, Code: "synthetic-one-use-code", State: input.State}, nil
			},
			Exchange: func(_ context.Context, _ *http.Request, clientID, clientSecret, code, redirectURI, verifier string) (IntelligenceOIDCTokenResponse, error) {
				exchangeCall = struct{ clientID, clientSecret, code, redirectURI, verifier string }{clientID, clientSecret, code, redirectURI, verifier}
				return IntelligenceOIDCTokenResponse{AccessToken: "synthetic-opaque-access-token", TokenType: "Bearer", ExpiresIn: 300, IDToken: "synthetic-signed-id-token"}, nil
			},
		},
	})
	challenge := strings.Repeat("A", 43)
	query := url.Values{
		"response_type": {"code"}, "client_id": {"registered-client"}, "redirect_uri": {"https://intelligence.example/callback?fixed=1"},
		"state": {"synthetic-state"}, "nonce": {"synthetic-nonce"}, "code_challenge": {challenge}, "code_challenge_method": {"S256"},
	}
	authorizeRequest := httptest.NewRequest(http.MethodGet, "/oauth2/authorize?"+query.Encode(), nil)
	authorizeRequest.Header.Set("Authorization", "Bearer synthetic-session")
	authorizeRecorder := httptest.NewRecorder()
	handler.ServeHTTP(authorizeRecorder, authorizeRequest)
	if authorizeRecorder.Code != http.StatusFound || authorizeRecorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("authorize status=%d cache=%q body=%s", authorizeRecorder.Code, authorizeRecorder.Header().Get("Cache-Control"), authorizeRecorder.Body.String())
	}
	if authorizeInput.ResponseType != "code" || authorizeInput.CodeChallengeMethod != "S256" || authorizeInput.State != "synthetic-state" || authorizeInput.Nonce != "synthetic-nonce" {
		t.Fatalf("authorization request fields were not forwarded: %#v", authorizeInput)
	}
	callback, err := url.Parse(authorizeRecorder.Header().Get("Location"))
	if err != nil || callback.Query().Get("fixed") != "1" || callback.Query().Get("state") != "synthetic-state" || callback.Query().Get("code") != "synthetic-one-use-code" {
		t.Fatalf("authorization callback=%v err=%v", callback, err)
	}

	form := url.Values{"grant_type": {"authorization_code"}, "code": {"synthetic-one-use-code"}, "redirect_uri": {query.Get("redirect_uri")}, "code_verifier": {strings.Repeat("x", 43)}}
	tokenRequest := httptest.NewRequest(http.MethodPost, "/oauth2/token", strings.NewReader(form.Encode()))
	tokenRequest.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokenRequest.SetBasicAuth("registered-client", "synthetic-client-secret")
	tokenRecorder := httptest.NewRecorder()
	handler.ServeHTTP(tokenRecorder, tokenRequest)
	if tokenRecorder.Code != http.StatusOK || tokenRecorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("token status=%d cache=%q body=%s", tokenRecorder.Code, tokenRecorder.Header().Get("Cache-Control"), tokenRecorder.Body.String())
	}
	if exchangeCall.clientID != "registered-client" || exchangeCall.clientSecret != "synthetic-client-secret" || exchangeCall.code != "synthetic-one-use-code" || exchangeCall.redirectURI != query.Get("redirect_uri") || exchangeCall.verifier != strings.Repeat("x", 43) {
		t.Fatalf("token exchange fields were not bound to confidential client auth: %#v", exchangeCall)
	}
	var payload struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		ExpiresIn   int64  `json:"expires_in"`
		IDToken     string `json:"id_token"`
	}
	if err := json.Unmarshal(tokenRecorder.Body.Bytes(), &payload); err != nil || payload.IDToken != "synthetic-signed-id-token" || payload.AccessToken == "" || payload.AccessToken == payload.IDToken || payload.TokenType != "Bearer" || payload.ExpiresIn != 300 {
		t.Fatalf("OIDC code response must include a distinct access token and ID token: err=%v payload=%#v", err, payload)
	}
}

func TestIntelligenceOIDCHandlerRejectsCredentialInBodyAndIsDisabledByDefault(t *testing.T) {
	calls := 0
	handler := NewIntelligenceOIDCHandler(IntelligenceOIDCHandlerConfig{
		Enabled: true,
		Operations: IntelligenceOIDCOperations{Exchange: func(context.Context, *http.Request, string, string, string, string, string) (IntelligenceOIDCTokenResponse, error) {
			calls++
			return IntelligenceOIDCTokenResponse{AccessToken: "access-token", TokenType: "Bearer", ExpiresIn: 300, IDToken: "id-token"}, nil
		}},
	})
	form := url.Values{
		"grant_type": {"authorization_code"}, "code": {"code"}, "redirect_uri": {"https://intelligence.example/callback"},
		"code_verifier": {strings.Repeat("x", 43)}, "client_id": {"registered-client"},
	}
	request := httptest.NewRequest(http.MethodPost, "/oauth2/token", strings.NewReader(form.Encode()))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.SetBasicAuth("registered-client", "synthetic-client-secret")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusBadRequest || calls != 0 || recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("body client credential status=%d exchange_calls=%d cache=%q", recorder.Code, calls, recorder.Header().Get("Cache-Control"))
	}

	disabled := httptest.NewRecorder()
	NewIntelligenceOIDCHandler(IntelligenceOIDCHandlerConfig{}).ServeHTTP(disabled, httptest.NewRequest(http.MethodGet, "/.well-known/openid-configuration", nil))
	if disabled.Code != http.StatusNotFound || disabled.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("disabled OIDC discovery status=%d cache=%q", disabled.Code, disabled.Header().Get("Cache-Control"))
	}
}
