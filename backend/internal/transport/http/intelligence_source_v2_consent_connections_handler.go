package http

import (
	"context"
	"mime"
	stdhttp "net/http"
	"strings"
)

var intelligenceSourceV2GrantFormFields = map[string]struct{}{
	"read": {}, "process": {}, "external_transfer": {}, "export": {}, "codex": {}, "reply": {},
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
	if credential.ConnectionID == "" || credential.ChatID == "" || credential.SourceCredential == "" || credential.TokenType != "Bearer" || credential.ExpiresIn <= 0 || len(credential.Grants) != 6 {
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
