package app

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"

	"github.com/google/uuid"
)

func TestIntelligenceSourceV2AuthorizationRouteHasVersionedNoStoreFailure(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	request, err := http.NewRequest(http.MethodPost, fixture.serverURL+"/api/v2/intelligence/source/authorization:check", strings.NewReader(`{"schema_version":"v2","resource_ids":["synthetic-resource"],"operation":"read"}`))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer unknown-source-token")
	response, err := fixture.httpClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	var envelope struct {
		SchemaVersion string `json:"schema_version"`
		Error         struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		t.Fatalf("decode v2 source error envelope: %v; body=%s", err, body)
	}
	if response.StatusCode != http.StatusUnauthorized || envelope.SchemaVersion != "v2" || envelope.Error.Code != "invalid_credential" || response.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("v2 authorization failure = status %d, schema %q, code %q, cache-control %q, body=%s; want 401/v2/invalid_credential/no-store", response.StatusCode, envelope.SchemaVersion, envelope.Error.Code, response.Header.Get("Cache-Control"), body)
	}
}

func TestIntelligenceSourceV2AuthorizationUsesCurrentScopedOperationGrants(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	connectionID, credential := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{})
	messageID := "source-v2-policy-message-" + uuid.NewString()
	otherMessageID := "source-v2-policy-out-of-chat-" + uuid.NewString()
	unknownProtocolID := "source-v2-policy-unknown-protocol-" + uuid.NewString()
	createdAt := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `
		INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at)
		VALUES($1,$2,$3,'text','synthetic authorization content',$4,$4),($5,$6,$3,'text','synthetic other-chat content',$4,$4)`, messageID, fixture.chatID, fixture.userID, createdAt, otherMessageID, fixture.secondChatID); err != nil {
		t.Fatalf("insert synthetic policy messages: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `INSERT INTO public.messages(id,chat_id,sender_id,type,content,encryption_protocol,created_at,updated_at) VALUES($1,$2,$3,'text','synthetic unsupported protocol','future_cipher', $4,$4)`, unknownProtocolID, fixture.chatID, fixture.userID, createdAt); err != nil {
		t.Fatalf("insert synthetic unsupported-protocol message: %v", err)
	}
	operations := []string{"read", "process", "external_transfer", "export"}
	for _, operation := range operations {
		decision := sourceV2AuthorizationDecision(t, fixture, credential, messageID, operation)
		if decision.Allowed {
			t.Errorf("default-denied %s grant was allowed: %#v", operation, decision)
		}
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `
		UPDATE public.intelligence_source_v2_connection_grants SET granted=true,granted_at=now(),revoked_at=NULL,updated_at=now()
		WHERE connection_id=$1 AND grant_type IN ('read','process','export')`, connectionID); err != nil {
		t.Fatalf("grant synthetic operation permissions: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `UPDATE public.families SET ai_notes_enabled=true WHERE id=$1`, fixture.familyID); err != nil {
		t.Fatalf("enable synthetic AI Notes policy: %v", err)
	}
	for operation, want := range map[string]bool{"read": true, "process": true, "external_transfer": false, "export": true} {
		decision := sourceV2AuthorizationDecision(t, fixture, credential, messageID, operation)
		if decision.Allowed != want || decision.ConnectionID != connectionID || decision.PrincipalID != fixture.userID || decision.Scope.Kind != "chat" || decision.Scope.ResourceID != fixture.chatID || decision.ValidUntil.Sub(decision.DecidedAt) > 5*time.Minute {
			t.Errorf("%s decision = %#v, want allowed=%v and credential-mapped scope", operation, decision, want)
		}
	}
	if decision := sourceV2AuthorizationDecision(t, fixture, credential, otherMessageID, "read"); decision.Allowed {
		t.Errorf("message outside the consented chat was allowed: %#v", decision)
	}
	if decision := sourceV2AuthorizationDecision(t, fixture, credential, unknownProtocolID, "read"); decision.Allowed {
		t.Errorf("message with unsupported encryption protocol was allowed: %#v", decision)
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `UPDATE public.families SET ai_notes_enabled=false WHERE id=$1`, fixture.familyID); err != nil {
		t.Fatalf("disable synthetic AI Notes policy: %v", err)
	}
	if decision := sourceV2AuthorizationDecision(t, fixture, credential, messageID, "process"); decision.Allowed {
		t.Errorf("process was allowed while current AI Notes policy was disabled: %#v", decision)
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `UPDATE public.intelligence_source_v2_connections SET credential_expires_at=now()+interval '3 seconds' WHERE id=$1`, connectionID); err != nil {
		t.Fatalf("set synthetic near-expiry source credential: %v", err)
	}
	var credentialExpiresAt time.Time
	if err := fixture.server.sqlDB.QueryRowContext(context.Background(), `SELECT credential_expires_at FROM public.intelligence_source_v2_connections WHERE id=$1`, connectionID).Scan(&credentialExpiresAt); err != nil {
		t.Fatalf("read synthetic source credential expiry: %v", err)
	}
	if decision := sourceV2AuthorizationDecision(t, fixture, credential, messageID, "read"); !decision.Allowed || decision.ValidUntil.After(credentialExpiresAt) {
		t.Errorf("authorization decision outlives source credential: %#v credential_expires_at=%s", decision, credentialExpiresAt)
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `DELETE FROM public.chat_members WHERE chat_id=$1 AND user_id=$2`, fixture.chatID, fixture.userID); err != nil {
		t.Fatalf("remove synthetic current membership: %v", err)
	}
	if decision := sourceV2AuthorizationDecision(t, fixture, credential, messageID, "read"); decision.Allowed {
		t.Errorf("read was allowed after current chat membership was removed: %#v", decision)
	}
	legacy := sourceV2Request(t, fixture.httpClient, http.MethodGet, fixture.serverURL+"/api/v1/intelligence/source/events", credential, nil)
	defer func() { _ = legacy.Body.Close() }()
	if legacy.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(legacy.Body)
		t.Fatalf("v2 credential was accepted by v1 source route: status=%d body=%s", legacy.StatusCode, body)
	}
}

func TestIntelligenceSourceV2ConsentExchangeRotationAndRevocation(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	ctx := context.Background()

	flowQuery := url.Values{
		"client_id":             {fixture.clientID},
		"redirect_uri":          {fixture.redirectURI},
		"state":                 {"synthetic-state-value"},
		"code_challenge":        {fixture.challenge},
		"code_challenge_method": {"S256"},
	}
	unauthenticated := sourceV2Request(t, fixture.httpClient, http.MethodGet, fixture.serverURL+"/api/v2/intelligence/authorize?"+flowQuery.Encode(), "", nil)
	if unauthenticated.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(unauthenticated.Body)
		_ = unauthenticated.Body.Close()
		t.Fatalf("unauthenticated consent status = %d, want 401; body=%s", unauthenticated.StatusCode, body)
	}
	_ = unauthenticated.Body.Close()
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.users SET is_active=0 WHERE id=$1`, fixture.userID); err != nil {
		t.Fatalf("deactivate synthetic Messenger principal: %v", err)
	}
	inactiveUser := sourceV2Request(t, fixture.httpClient, http.MethodGet, fixture.serverURL+"/api/v2/intelligence/authorize?"+flowQuery.Encode(), fixture.userToken, nil)
	if inactiveUser.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(inactiveUser.Body)
		_ = inactiveUser.Body.Close()
		t.Fatalf("inactive Messenger principal status = %d, want 401; body=%s", inactiveUser.StatusCode, body)
	}
	_ = inactiveUser.Body.Close()
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.users SET is_active=1 WHERE id=$1`, fixture.userID); err != nil {
		t.Fatalf("reactivate synthetic Messenger principal: %v", err)
	}

	offerResponse := sourceV2Request(t, fixture.httpClient, http.MethodGet, fixture.serverURL+"/api/v2/intelligence/authorize?"+flowQuery.Encode(), fixture.userToken, nil)
	if offerResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(offerResponse.Body)
		_ = offerResponse.Body.Close()
		t.Fatalf("consent offer status = %d, want 200; body=%s", offerResponse.StatusCode, body)
	}
	var offer struct {
		ClientID    string `json:"client_id"`
		RedirectURI string `json:"redirect_uri"`
		Chats       []struct {
			ID string `json:"id"`
		} `json:"chats"`
		Grants map[string]bool `json:"grants"`
	}
	if err := json.NewDecoder(offerResponse.Body).Decode(&offer); err != nil {
		_ = offerResponse.Body.Close()
		t.Fatalf("decode consent offer: %v", err)
	}
	_ = offerResponse.Body.Close()
	if offer.ClientID != fixture.clientID || offer.RedirectURI != fixture.redirectURI {
		t.Fatalf("consent offer client/callback = %q/%q", offer.ClientID, offer.RedirectURI)
	}
	if len(offer.Chats) != 2 {
		t.Fatalf("consent offer listed %d accessible chats, want exactly the two synthetic member chats", len(offer.Chats))
	}
	for _, grant := range []string{"read", "process", "external_transfer", "export"} {
		if granted, ok := offer.Grants[grant]; !ok || granted {
			t.Fatalf("initial %s grant = %v (present=%v), want denied", grant, granted, ok)
		}
	}

	invalidConsent := map[string]any{
		"client_id": fixture.clientID, "redirect_uri": "https://attacker.example/callback",
		"state": "synthetic-state-value", "code_challenge": fixture.challenge, "code_challenge_method": "S256",
		"chat_id": fixture.chatID, "grants": map[string]bool{"read": true},
	}
	invalidCallbackResponse := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/authorize", fixture.userToken, invalidConsent)
	if invalidCallbackResponse.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(invalidCallbackResponse.Body)
		_ = invalidCallbackResponse.Body.Close()
		t.Fatalf("unregistered callback status = %d, want 400; body=%s", invalidCallbackResponse.StatusCode, body)
	}
	_ = invalidCallbackResponse.Body.Close()

	invalidChat := map[string]any{
		"client_id": fixture.clientID, "redirect_uri": fixture.redirectURI,
		"state": "synthetic-state-value", "code_challenge": fixture.challenge, "code_challenge_method": "S256",
		"chat_id": "not-a-current-member-chat", "grants": map[string]bool{"read": true},
	}
	invalidChatResponse := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/authorize", fixture.userToken, invalidChat)
	if invalidChatResponse.StatusCode != http.StatusForbidden {
		body, _ := io.ReadAll(invalidChatResponse.Body)
		_ = invalidChatResponse.Body.Close()
		t.Fatalf("inaccessible chat consent status = %d, want 403; body=%s", invalidChatResponse.StatusCode, body)
	}
	_ = invalidChatResponse.Body.Close()

	consent := map[string]any{
		"client_id": fixture.clientID, "redirect_uri": fixture.redirectURI,
		"state": "synthetic-state-value", "code_challenge": fixture.challenge, "code_challenge_method": "S256",
		"chat_id": fixture.chatID,
		"grants":  map[string]bool{"read": true},
	}
	consentResponse := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/authorize", fixture.userToken, consent)
	if consentResponse.StatusCode != http.StatusFound {
		body, _ := io.ReadAll(consentResponse.Body)
		_ = consentResponse.Body.Close()
		t.Fatalf("valid consent status = %d, want 302; body=%s", consentResponse.StatusCode, body)
	}
	if body, _ := io.ReadAll(consentResponse.Body); len(body) != 0 {
		_ = consentResponse.Body.Close()
		t.Fatalf("authorization code appeared in redirect response body: %q", body)
	}
	_ = consentResponse.Body.Close()
	callback, err := url.Parse(consentResponse.Header.Get("Location"))
	if err != nil || callback.Scheme+"://"+callback.Host+callback.EscapedPath() != fixture.redirectURI[:strings.Index(fixture.redirectURI, "?")] {
		t.Fatalf("consent redirect = %q, want exact registered callback", consentResponse.Header.Get("Location"))
	}
	if callback.Query().Get("state") != "synthetic-state-value" || callback.Query().Get("code") == "" {
		t.Fatalf("consent callback omitted state or code: %q", callback.RawQuery)
	}
	code := callback.Query().Get("code")
	codeDigest := sha256.Sum256([]byte(code))
	var hashedCodeCount int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_consent_codes WHERE code_hash=$1`, codeDigest[:]).Scan(&hashedCodeCount); err != nil {
		t.Fatalf("inspect consent code hash: %v", err)
	}
	if hashedCodeCount != 1 {
		t.Fatalf("persisted matching consent-code hashes = %d, want 1", hashedCodeCount)
	}
	var persistedCodeHash []byte
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT code_hash FROM public.intelligence_source_v2_consent_codes WHERE code_hash=$1`, codeDigest[:]).Scan(&persistedCodeHash); err != nil {
		t.Fatalf("read persisted consent-code verifier: %v", err)
	}
	if len(persistedCodeHash) != sha256.Size || string(persistedCodeHash) == code {
		t.Fatal("consent code was not stored only as its fixed-size hash")
	}

	wrongVerifier := sourceV2TokenRequest(t, fixture, "authorization_code", code, "wrong-verifier-that-is-long-enough-to-be-rejected-by-pkce-check", "")
	if wrongVerifier.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(wrongVerifier.Body)
		_ = wrongVerifier.Body.Close()
		t.Fatalf("wrong PKCE verifier status = %d, want 400; body=%s", wrongVerifier.StatusCode, body)
	}
	_ = wrongVerifier.Body.Close()

	wrongClient := sourceV2TokenRequestWithSecret(t, fixture, "authorization_code", code, fixture.verifier, "", "incorrect synthetic client secret")
	if wrongClient.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(wrongClient.Body)
		_ = wrongClient.Body.Close()
		t.Fatalf("wrong confidential client secret status = %d, want 401; body=%s", wrongClient.StatusCode, body)
	}
	_ = wrongClient.Body.Close()

	exchangeResponse := sourceV2TokenRequest(t, fixture, "authorization_code", code, fixture.verifier, "")
	if exchangeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(exchangeResponse.Body)
		_ = exchangeResponse.Body.Close()
		t.Fatalf("consent token exchange status = %d, want 200; body=%s", exchangeResponse.StatusCode, body)
	}
	exchangeBody, err := io.ReadAll(exchangeResponse.Body)
	if err != nil {
		_ = exchangeResponse.Body.Close()
		t.Fatalf("read issued credential response: %v", err)
	}
	var issued struct {
		ConnectionID     string          `json:"connection_id"`
		SourceCredential string          `json:"source_credential"`
		TokenType        string          `json:"token_type"`
		ExpiresIn        int64           `json:"expires_in"`
		Grants           map[string]bool `json:"grants"`
	}
	if err := json.Unmarshal(exchangeBody, &issued); err != nil {
		t.Fatalf("decode issued source credential: %v", err)
	}
	_ = exchangeResponse.Body.Close()
	if strings.Contains(string(exchangeBody), code) {
		t.Fatal("consent code appeared in the source credential response")
	}
	if issued.ConnectionID == "" || issued.SourceCredential == "" || issued.TokenType != "Bearer" || issued.ExpiresIn != int64((30*24*time.Hour).Seconds()) {
		t.Fatalf("invalid source credential response: %+v", issued)
	}
	if strings.Count(issued.SourceCredential, ".") != 0 {
		t.Fatal("source credential must be opaque and distinct from an OIDC/JWT token")
	}
	if len(issued.Grants) != 4 || !issued.Grants["read"] || issued.Grants["process"] || issued.Grants["external_transfer"] || issued.Grants["export"] {
		t.Fatalf("independent consent grants = %#v", issued.Grants)
	}
	credentialDigest := sha256.Sum256([]byte(issued.SourceCredential))
	var persistedHash []byte
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT credential_hash FROM public.intelligence_source_v2_connections WHERE id=$1`, issued.ConnectionID).Scan(&persistedHash); err != nil {
		t.Fatalf("read source credential verifier: %v", err)
	}
	if string(persistedHash) != string(credentialDigest[:]) {
		t.Fatal("persisted source credential verifier is not SHA-256 of the one-time credential")
	}
	var scopedChatID string
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT chat_id FROM public.intelligence_source_v2_connection_chats WHERE connection_id=$1`, issued.ConnectionID).Scan(&scopedChatID); err != nil {
		t.Fatalf("read consent chat scope: %v", err)
	}
	if scopedChatID != fixture.chatID {
		t.Fatalf("connection chat scope = %q, want only the explicitly selected chat %q", scopedChatID, fixture.chatID)
	}
	var persistedGrantCount int
	var persistedRead, persistedProcess, persistedTransfer, persistedExport bool
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `
		SELECT count(*),bool_or(grant_type='read' AND granted),bool_or(grant_type='process' AND granted),
		       bool_or(grant_type='external_transfer' AND granted),bool_or(grant_type='export' AND granted)
		FROM public.intelligence_source_v2_connection_grants WHERE connection_id=$1`, issued.ConnectionID).Scan(
		&persistedGrantCount, &persistedRead, &persistedProcess, &persistedTransfer, &persistedExport); err != nil {
		t.Fatalf("inspect persisted independent grants: %v", err)
	}
	if persistedGrantCount != 4 || !persistedRead || persistedProcess || persistedTransfer || persistedExport {
		t.Fatalf("persisted independent grants count/read/process/transfer/export = %d/%v/%v/%v/%v", persistedGrantCount, persistedRead, persistedProcess, persistedTransfer, persistedExport)
	}
	var sourceCredentialGrantRows int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_consent_codes WHERE code_hash=$1`, []byte(issued.SourceCredential)).Scan(&sourceCredentialGrantRows); err != nil {
		t.Fatalf("check credential non-disclosure in consent records: %v", err)
	}
	if sourceCredentialGrantRows != 0 {
		t.Fatal("source credential was persisted as a consent code")
	}
	var consumedCodeCount int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_consent_codes WHERE code_hash=$1`, codeDigest[:]).Scan(&consumedCodeCount); err != nil {
		t.Fatalf("check one-use consent code removal: %v", err)
	}
	if consumedCodeCount != 0 {
		t.Fatal("exchanged consent code was not consumed")
	}
	var auditContainsSecret int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_audit WHERE operation LIKE '%'||$1||'%' OR result LIKE '%'||$1||'%' OR COALESCE(grant_type,'') LIKE '%'||$1||'%'`, issued.SourceCredential).Scan(&auditContainsSecret); err != nil {
		t.Fatalf("inspect source audit secrecy: %v", err)
	}
	if auditContainsSecret != 0 {
		t.Fatal("source credential appeared in an audit record")
	}
	var auditContainsCode int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_audit WHERE operation LIKE '%'||$1||'%' OR result LIKE '%'||$1||'%' OR COALESCE(grant_type,'') LIKE '%'||$1||'%'`, code).Scan(&auditContainsCode); err != nil {
		t.Fatalf("inspect authorization code secrecy in audit: %v", err)
	}
	if auditContainsCode != 0 {
		t.Fatal("authorization code appeared in an audit record")
	}
	if _, err := parseAccessToken(fixture.server.cfg, issued.SourceCredential); err == nil {
		t.Fatal("source credential was accepted as a Messenger or OIDC signed access token")
	}
	if _, err := fixture.server.authenticateIntelligenceSource(ctx, issued.SourceCredential); err == nil {
		t.Fatal("v2 source credential was accepted by the legacy v1 source authenticator")
	}
	if _, err := fixture.server.authenticateIntelligenceSourceV2Credential(ctx, issued.SourceCredential); err != nil {
		t.Fatalf("v2 source credential was rejected by its v2 authenticator: %v", err)
	}
	messageID := "source-v2-message-" + uuid.NewString()
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `
		INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at)
		VALUES($1,$2,$3,'text','synthetic source v2 content',$4,$4)`, messageID, fixture.chatID, fixture.userID, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("insert synthetic post-consent message: %v", err)
	}
	var legacyCaptureCount int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `
		SELECT (SELECT count(*) FROM public.intelligence_source_revisions WHERE connection_id=$1)
		     + (SELECT count(*) FROM public.intelligence_source_events WHERE connection_id=$1)`, issued.ConnectionID).Scan(&legacyCaptureCount); err != nil {
		t.Fatalf("inspect legacy source capture isolation: %v", err)
	}
	if legacyCaptureCount != 0 {
		t.Fatalf("v2 consent created %d legacy v1 revision/event rows, want none", legacyCaptureCount)
	}
	replayedCode := sourceV2TokenRequest(t, fixture, "authorization_code", code, fixture.verifier, "")
	if replayedCode.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(replayedCode.Body)
		_ = replayedCode.Body.Close()
		t.Fatalf("replayed consent code status = %d, want 400; body=%s", replayedCode.StatusCode, body)
	}
	_ = replayedCode.Body.Close()

	rotations := make(chan *http.Response, 2)
	var rotationWait sync.WaitGroup
	for range 2 {
		rotationWait.Add(1)
		go func() {
			defer rotationWait.Done()
			rotations <- sourceV2RotationRequest(t, fixture, issued.ConnectionID, issued.SourceCredential)
		}()
	}
	rotationWait.Wait()
	close(rotations)
	var successfulRotations int
	var rotatedCredential string
	for response := range rotations {
		body, readErr := io.ReadAll(response.Body)
		_ = response.Body.Close()
		if readErr != nil {
			t.Fatalf("read rotation response: %v", readErr)
		}
		if response.StatusCode == http.StatusOK {
			successfulRotations++
			var rotated struct {
				SourceCredential string `json:"source_credential"`
			}
			if err := json.Unmarshal(body, &rotated); err != nil {
				t.Fatalf("decode rotated source credential: %v", err)
			}
			rotatedCredential = rotated.SourceCredential
		} else if response.StatusCode != http.StatusBadRequest {
			t.Fatalf("losing concurrent rotation status = %d, want 400; body=%s", response.StatusCode, body)
		}
	}
	if successfulRotations != 1 || rotatedCredential == "" {
		t.Fatalf("successful concurrent rotations = %d, want exactly one", successfulRotations)
	}
	if _, err := fixture.server.authenticateIntelligenceSourceV2Credential(ctx, issued.SourceCredential); err == nil {
		t.Fatal("rotated source credential remained valid")
	}
	if _, err := fixture.server.authenticateIntelligenceSourceV2Credential(ctx, rotatedCredential); err != nil {
		t.Fatalf("newly rotated source credential is invalid: %v", err)
	}

	revokeGrantResponse := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/revoke", fixture.userToken, map[string]string{"connection_id": issued.ConnectionID, "grant": "process"})
	if revokeGrantResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(revokeGrantResponse.Body)
		_ = revokeGrantResponse.Body.Close()
		t.Fatalf("independent grant revoke status = %d, want 200; body=%s", revokeGrantResponse.StatusCode, body)
	}
	_ = revokeGrantResponse.Body.Close()
	var readGranted, processGranted bool
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT bool_or(grant_type='read' AND granted),bool_or(grant_type='process' AND granted) FROM public.intelligence_source_v2_connection_grants WHERE connection_id=$1`, issued.ConnectionID).Scan(&readGranted, &processGranted); err != nil {
		t.Fatalf("inspect independent grant revocation: %v", err)
	}
	if !readGranted || processGranted {
		t.Fatalf("revoking process changed independent read grant: read=%v process=%v", readGranted, processGranted)
	}
	var processRevokeAuditCount int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `
		SELECT count(*) FROM public.intelligence_source_v2_audit
		WHERE connection_id=$1 AND operation='grant_revoke' AND result='revoked' AND grant_type='process'`, issued.ConnectionID).Scan(&processRevokeAuditCount); err != nil {
		t.Fatalf("inspect grant revocation audit record: %v", err)
	}
	if processRevokeAuditCount != 1 {
		t.Fatalf("process grant revocation audit records = %d, want 1", processRevokeAuditCount)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.intelligence_source_v2_connections SET credential_expires_at=now()-interval '1 second' WHERE id=$1`, issued.ConnectionID); err != nil {
		t.Fatalf("expire synthetic source credential: %v", err)
	}
	if _, err := fixture.server.authenticateIntelligenceSourceV2Credential(ctx, rotatedCredential); err == nil {
		t.Fatal("expired source credential remained valid")
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.intelligence_source_v2_connections SET credential_expires_at=now()+interval '1 day' WHERE id=$1`, issued.ConnectionID); err != nil {
		t.Fatalf("restore synthetic source credential expiry for revoke case: %v", err)
	}

	revokeConnectionResponse := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/revoke", fixture.userToken, map[string]string{"connection_id": issued.ConnectionID})
	if revokeConnectionResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(revokeConnectionResponse.Body)
		_ = revokeConnectionResponse.Body.Close()
		t.Fatalf("connection revoke status = %d, want 200; body=%s", revokeConnectionResponse.StatusCode, body)
	}
	_ = revokeConnectionResponse.Body.Close()
	if _, err := fixture.server.authenticateIntelligenceSourceV2Credential(ctx, rotatedCredential); err == nil {
		t.Fatal("revoked source credential remained valid")
	}
}

func TestIntelligenceSourceV2BrowserConsentTicketIsBoundOneUseAndConnectionsArePrivate(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	ctx := context.Background()
	const state = "synthetic-browser-state"
	requestBody := map[string]any{
		"flow": "source_v2", "response_type": "code", "client_id": fixture.clientID, "redirect_uri": fixture.redirectURI,
		"state": state, "code_challenge": fixture.challenge, "code_challenge_method": "S256", "chat_id": fixture.chatID,
		"grants": map[string]bool{"read": true, "process": false, "external_transfer": true, "export": false},
	}
	sessionResponse := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/authorize-session", fixture.userToken, requestBody)
	if sessionResponse.StatusCode != http.StatusOK || sessionResponse.Header.Get("Cache-Control") != "no-store" {
		body, _ := io.ReadAll(sessionResponse.Body)
		_ = sessionResponse.Body.Close()
		t.Fatalf("create source v2 browser ticket status=%d body=%s", sessionResponse.StatusCode, body)
	}
	var sessionResponseBody map[string]any
	if err := json.NewDecoder(sessionResponse.Body).Decode(&sessionResponseBody); err != nil {
		_ = sessionResponse.Body.Close()
		t.Fatalf("decode source v2 browser ticket response: %v", err)
	}
	_ = sessionResponse.Body.Close()
	if len(sessionResponseBody) != 1 || sessionResponseBody["expires_in"] != float64(120) {
		t.Fatalf("browser session response returned unexpected fields: %#v", sessionResponseBody)
	}
	var browserTicket string
	for _, cookie := range sessionResponse.Cookies() {
		if cookie.Name == "messenger_source_v2_browser" {
			browserTicket = cookie.Value
			if cookie.Path != "/api/v2/intelligence/authorize" || !cookie.HttpOnly || cookie.MaxAge != 120 {
				t.Fatalf("source browser cookie is not path-scoped and short-lived: %#v", cookie)
			}
		}
	}
	if browserTicket == "" {
		t.Fatal("browser ticket was not returned in HttpOnly cookie")
	}
	ticketHash := sha256.Sum256([]byte(browserTicket))
	var storedHash []byte
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT ticket_hash FROM public.intelligence_browser_authorization_sessions WHERE flow='source_v2' AND user_id=$1`, fixture.userID).Scan(&storedHash); err != nil {
		t.Fatalf("read source browser ticket hash: %v", err)
	}
	if !bytes.Equal(storedHash, ticketHash[:]) || bytes.Contains(storedHash, []byte(browserTicket)) {
		t.Fatal("source browser ticket was not persisted as only its SHA-256 hash")
	}
	wrongFlowRequest := httptest.NewRequest(http.MethodGet, fixture.serverURL+"/oauth2/authorize", nil)
	_, wrongFlowErr := fixture.server.authorizeIntelligenceOIDCBrowserSession(ctx, wrongFlowRequest, browserTicket, httptransport.IntelligenceOIDCAuthorizationRequest{
		ResponseType: "code", ClientID: fixture.clientID, RedirectURI: fixture.redirectURI, State: state, Nonce: "synthetic-nonce",
		CodeChallenge: fixture.challenge, CodeChallengeMethod: "S256",
	})
	if wrongFlowErr == nil {
		t.Fatal("source consent ticket was accepted by the OIDC authorization flow")
	}
	var ticketRows int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_browser_authorization_sessions WHERE ticket_hash=$1 AND flow='source_v2'`, ticketHash[:]).Scan(&ticketRows); err != nil || ticketRows != 1 {
		t.Fatalf("cross-flow ticket attempt consumed source session rows=%d err=%v", ticketRows, err)
	}

	query := url.Values{
		"response_type": {"code"}, "client_id": {fixture.clientID}, "redirect_uri": {fixture.redirectURI},
		"state": {state}, "code_challenge": {fixture.challenge}, "code_challenge_method": {"S256"},
	}
	browserStart, err := http.NewRequest(http.MethodGet, fixture.serverURL+"/api/v2/intelligence/authorize?"+query.Encode(), nil)
	if err != nil {
		t.Fatalf("build browser consent start: %v", err)
	}
	browserStart.Header.Set("Accept", "text/html")
	browserStartResponse, err := fixture.httpClient.Do(browserStart)
	if err != nil {
		t.Fatalf("request browser consent start: %v", err)
	}
	if browserStartResponse.StatusCode != http.StatusFound {
		body, _ := io.ReadAll(browserStartResponse.Body)
		_ = browserStartResponse.Body.Close()
		t.Fatalf("browser consent start status=%d body=%s", browserStartResponse.StatusCode, body)
	}
	consentPage, err := url.Parse(browserStartResponse.Header.Get("Location"))
	_ = browserStartResponse.Body.Close()
	if err != nil || consentPage.Path != "/intelligence/consent" || consentPage.Query().Get("flow") != "source_v2" || consentPage.Query().Get("state") != state {
		t.Fatalf("browser consent page = %q (err %v)", browserStartResponse.Header.Get("Location"), err)
	}

	form := url.Values{
		"response_type": {"code"}, "client_id": {fixture.clientID}, "redirect_uri": {fixture.redirectURI},
		"state": {state}, "code_challenge": {fixture.challenge}, "code_challenge_method": {"S256"}, "chat_id": {fixture.chatID},
		"read": {"true"}, "process": {"false"}, "external_transfer": {"true"}, "export": {"false"},
	}
	submitBrowserForm := func(values url.Values) *http.Response {
		t.Helper()
		formRequest, err := http.NewRequest(http.MethodPost, fixture.serverURL+"/api/v2/intelligence/authorize", strings.NewReader(values.Encode()))
		if err != nil {
			t.Fatalf("build source browser form: %v", err)
		}
		formRequest.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		formRequest.Header.Set("Origin", normalizeConfiguredOriginForTest(fixture.server.cfg.AppURL))
		formRequest.AddCookie(&http.Cookie{Name: "messenger_source_v2_browser", Value: browserTicket})
		response, err := fixture.httpClient.Do(formRequest)
		if err != nil {
			t.Fatalf("submit source browser consent: %v", err)
		}
		return response
	}
	tamperedForm := make(url.Values, len(form))
	for key, values := range form {
		tamperedForm[key] = append([]string(nil), values...)
	}
	tamperedForm.Set("export", "true")
	tamperedResponse := submitBrowserForm(tamperedForm)
	if tamperedResponse.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(tamperedResponse.Body)
		_ = tamperedResponse.Body.Close()
		t.Fatalf("changed browser grant set status=%d body=%s", tamperedResponse.StatusCode, body)
	}
	_ = tamperedResponse.Body.Close()
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_browser_authorization_sessions WHERE ticket_hash=$1`, ticketHash[:]).Scan(&ticketRows); err != nil || ticketRows != 1 {
		t.Fatalf("tampered consent consumed the bound browser ticket rows=%d err=%v", ticketRows, err)
	}
	formResponse := submitBrowserForm(form)
	if formResponse.StatusCode != http.StatusFound || formResponse.Header.Get("Cache-Control") != "no-store" {
		body, _ := io.ReadAll(formResponse.Body)
		_ = formResponse.Body.Close()
		t.Fatalf("source browser consent status=%d body=%s", formResponse.StatusCode, body)
	}
	callback, err := url.Parse(formResponse.Header.Get("Location"))
	_ = formResponse.Body.Close()
	if err != nil || callback.Query().Get("state") != state || callback.Query().Get("code") == "" {
		t.Fatalf("source browser callback = %q (err %v)", callback, err)
	}
	code := callback.Query().Get("code")
	replay := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/authorize", fixture.userToken, map[string]any{
		"client_id": fixture.clientID, "redirect_uri": fixture.redirectURI, "state": state, "code_challenge": fixture.challenge,
		"code_challenge_method": "S256", "chat_id": fixture.chatID, "grants": requestBody["grants"],
	})
	if replay.StatusCode != http.StatusFound {
		body, _ := io.ReadAll(replay.Body)
		_ = replay.Body.Close()
		t.Fatalf("separate bearer path remains available after browser ticket use, status=%d body=%s", replay.StatusCode, body)
	}
	_ = replay.Body.Close()
	replayedBrowser := submitBrowserForm(form)
	if replayedBrowser.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(replayedBrowser.Body)
		_ = replayedBrowser.Body.Close()
		t.Fatalf("replayed source browser ticket status=%d body=%s", replayedBrowser.StatusCode, body)
	}
	_ = replayedBrowser.Body.Close()

	exchange := sourceV2TokenRequest(t, fixture, "authorization_code", code, fixture.verifier, "")
	if exchange.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(exchange.Body)
		_ = exchange.Body.Close()
		t.Fatalf("exchange browser-issued source code status=%d body=%s", exchange.StatusCode, body)
	}
	var issued struct {
		ConnectionID     string          `json:"connection_id"`
		SourceCredential string          `json:"source_credential"`
		Grants           map[string]bool `json:"grants"`
	}
	if err := json.NewDecoder(exchange.Body).Decode(&issued); err != nil {
		_ = exchange.Body.Close()
		t.Fatalf("decode browser-issued source credential: %v", err)
	}
	_ = exchange.Body.Close()
	if issued.SourceCredential == "" || !issued.Grants["read"] || issued.Grants["process"] || !issued.Grants["external_transfer"] || issued.Grants["export"] {
		t.Fatalf("browser grants changed during server exchange: %#v", issued)
	}
	list := sourceV2Request(t, fixture.httpClient, http.MethodGet, fixture.serverURL+"/api/v2/intelligence/connections", fixture.userToken, nil)
	if list.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(list.Body)
		_ = list.Body.Close()
		t.Fatalf("list own source connections status=%d body=%s", list.StatusCode, body)
	}
	var ownerList struct {
		Connections []struct {
			ID        string          `json:"id"`
			ChatID    string          `json:"chat_id"`
			Grants    map[string]bool `json:"grants"`
			RevokedAt *time.Time      `json:"revoked_at"`
		} `json:"connections"`
	}
	listBody, _ := io.ReadAll(list.Body)
	_ = list.Body.Close()
	if err := json.Unmarshal(listBody, &ownerList); err != nil || len(ownerList.Connections) != 1 || strings.Contains(string(listBody), issued.SourceCredential) {
		t.Fatalf("owner connection list = %s err=%v", listBody, err)
	}
	var owned *struct {
		ID        string          `json:"id"`
		ChatID    string          `json:"chat_id"`
		Grants    map[string]bool `json:"grants"`
		RevokedAt *time.Time      `json:"revoked_at"`
	}
	for i := range ownerList.Connections {
		if ownerList.Connections[i].ID == issued.ConnectionID {
			owned = &ownerList.Connections[i]
		}
	}
	if owned == nil || owned.ChatID != fixture.chatID || !owned.Grants["read"] || owned.Grants["process"] || !owned.Grants["external_transfer"] {
		t.Fatalf("own connection list did not preserve the independent chat grants: %#v", owned)
	}
	secondUserID := "source-v2-other-user-" + uuid.NewString()
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.users(id,family_id,username,password_hash,display_name,role,created_at) VALUES($1,$2,$1,'synthetic','Other synthetic principal','member',now())`, secondUserID, fixture.familyID); err != nil {
		t.Fatalf("create second same-family principal for ownership test: %v", err)
	}
	secondUserToken, _, err := createAccessToken(fixture.server.cfg, userPublic{ID: secondUserID, FamilyID: fixture.familyID, Role: "member", IsActive: true})
	if err != nil {
		t.Fatalf("mint second synthetic Messenger session: %v", err)
	}
	otherList := sourceV2Request(t, fixture.httpClient, http.MethodGet, fixture.serverURL+"/api/v2/intelligence/connections", secondUserToken, nil)
	var otherConnections struct {
		Connections []json.RawMessage `json:"connections"`
	}
	if otherList.StatusCode != http.StatusOK || json.NewDecoder(otherList.Body).Decode(&otherConnections) != nil || len(otherConnections.Connections) != 0 {
		body, _ := io.ReadAll(otherList.Body)
		_ = otherList.Body.Close()
		t.Fatalf("same-family non-owner connection list status=%d entries=%d body=%s", otherList.StatusCode, len(otherConnections.Connections), body)
	}
	_ = otherList.Body.Close()
	wholeRevoke := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/revoke", fixture.userToken, map[string]string{"connection_id": issued.ConnectionID, "grant": "connection"})
	if wholeRevoke.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(wholeRevoke.Body)
		_ = wholeRevoke.Body.Close()
		t.Fatalf("connection UI revoke sentinel status=%d body=%s", wholeRevoke.StatusCode, body)
	}
	_ = wholeRevoke.Body.Close()
	ownerAfterRevoke := sourceV2Request(t, fixture.httpClient, http.MethodGet, fixture.serverURL+"/api/v2/intelligence/connections", fixture.userToken, nil)
	var revokedList struct {
		Connections []struct {
			ID        string          `json:"id"`
			Grants    map[string]bool `json:"grants"`
			RevokedAt *time.Time      `json:"revoked_at"`
		} `json:"connections"`
	}
	if ownerAfterRevoke.StatusCode != http.StatusOK || json.NewDecoder(ownerAfterRevoke.Body).Decode(&revokedList) != nil || len(revokedList.Connections) != 1 || revokedList.Connections[0].ID != issued.ConnectionID || revokedList.Connections[0].RevokedAt == nil || revokedList.Connections[0].Grants["read"] {
		body, _ := io.ReadAll(ownerAfterRevoke.Body)
		_ = ownerAfterRevoke.Body.Close()
		t.Fatalf("whole connection revoke did not update safe list status=%d body=%s", ownerAfterRevoke.StatusCode, body)
	}
	_ = ownerAfterRevoke.Body.Close()
}

func normalizeConfiguredOriginForTest(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return parsed.Scheme + "://" + parsed.Host
}

type intelligenceSourceV2ConsentFixture struct {
	server       *Server
	serverURL    string
	httpClient   *http.Client
	userToken    string
	userID       string
	familyID     string
	clientID     string
	clientSecret string
	redirectURI  string
	chatID       string
	secondChatID string
	challenge    string
	verifier     string
}

func newIntelligenceSourceV2ConsentFixture(t *testing.T) intelligenceSourceV2ConsentFixture {
	t.Helper()
	server, _, _ := newTestServer(t)
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate synthetic consent signing key: %v", err)
	}
	privateKeyDER, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		t.Fatalf("encode synthetic consent signing key: %v", err)
	}
	const (
		issuer       = "https://messenger.example"
		clientID     = "synthetic-intelligence-client"
		clientSecret = "synthetic-confidential-client-secret"
		redirectURI  = "https://intelligence.example/oauth/callback?tenant=synthetic"
	)
	server.cfg.IntelligenceSourceEnabled = true
	server.cfg.IntelligenceOIDCEnabled = true
	server.cfg.IntelligenceOIDCIssuer = issuer
	server.cfg.IntelligenceOIDCClientID = clientID
	server.cfg.IntelligenceOIDCClientSecret = clientSecret
	server.cfg.IntelligenceOIDCRedirectURIs = []string{redirectURI}
	server.cfg.IntelligenceOIDCSigningKeyID = "synthetic-consent-key"
	server.cfg.IntelligenceOIDCSigningPrivateKeyPEM = string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privateKeyDER}))
	httpServer := httptest.NewServer(server.Routes())
	t.Cleanup(httpServer.Close)

	ctx := context.Background()
	familyID := "source-v2-family-" + uuid.NewString()
	userID := "source-v2-user-" + uuid.NewString()
	chatID := "source-v2-chat-" + uuid.NewString()
	secondChatID := "source-v2-chat-" + uuid.NewString()
	createdAt := time.Now().UTC().Format(time.RFC3339Nano)
	statements := []struct {
		query string
		args  []any
	}{
		{`INSERT INTO public.families(id,name,created_at,updated_at) VALUES($1,'Synthetic source v2 family',$2,$2)`, []any{familyID, createdAt}},
		{`INSERT INTO public.users(id,family_id,username,password_hash,display_name,role,created_at) VALUES($1,$2,$1,'synthetic','Synthetic source v2 principal','member',$3)`, []any{userID, familyID, createdAt}},
		{`INSERT INTO public.chats(id,family_id,type,title,media_visibility,created_at,updated_at) VALUES($1,$2,'group','Synthetic source v2 chat','members',$3,$3)`, []any{chatID, familyID, createdAt}},
		{`INSERT INTO public.chats(id,family_id,type,title,media_visibility,created_at,updated_at) VALUES($1,$2,'group','Second synthetic source v2 chat','members',$3,$3)`, []any{secondChatID, familyID, createdAt}},
		{`INSERT INTO public.chat_members(chat_id,user_id,created_at) VALUES($1,$2,$3)`, []any{chatID, userID, createdAt}},
		{`INSERT INTO public.chat_members(chat_id,user_id,created_at) VALUES($1,$2,$3)`, []any{secondChatID, userID, createdAt}},
		{`INSERT INTO public.intelligence_installations(id,tenant_id,family_id,enabled) VALUES($1,$2,$3,true)`, []any{"source-v2-install-" + uuid.NewString(), "synthetic-tenant-" + uuid.NewString(), familyID}},
	}
	for _, statement := range statements {
		if _, err := server.sqlDB.ExecContext(ctx, statement.query, statement.args...); err != nil {
			t.Fatalf("insert synthetic v2 consent fixture: %v", err)
		}
	}
	accessToken, _, err := createAccessToken(server.cfg, userPublic{ID: userID, FamilyID: familyID, Role: "member", IsActive: true})
	if err != nil {
		t.Fatalf("mint synthetic Messenger session: %v", err)
	}
	verifier := "synthetic-consent-pkce-verifier-with-at-least-forty-three-characters"
	challengeDigest := sha256.Sum256([]byte(verifier))
	return intelligenceSourceV2ConsentFixture{
		server: server, serverURL: httpServer.URL, httpClient: &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }},
		userToken: accessToken, userID: userID, familyID: familyID, clientID: clientID, clientSecret: clientSecret, redirectURI: redirectURI,
		chatID: chatID, verifier: verifier, challenge: base64.RawURLEncoding.EncodeToString(challengeDigest[:]),
		secondChatID: secondChatID,
	}
}

type sourceV2AuthorizationTestDecision struct {
	SchemaVersion string `json:"schema_version"`
	TenantID      string `json:"tenant_id"`
	ConnectionID  string `json:"connection_id"`
	PrincipalID   string `json:"principal_id"`
	ResourceID    string `json:"resource_id"`
	Operation     string `json:"operation"`
	Allowed       bool   `json:"allowed"`
	Scope         struct {
		Kind       string `json:"kind"`
		ResourceID string `json:"resource_id"`
	} `json:"scope"`
	PolicyRevision string    `json:"policy_revision"`
	DecidedAt      time.Time `json:"decided_at"`
	ValidUntil     time.Time `json:"valid_until"`
}

func createIntelligenceSourceV2TestConnection(t *testing.T, fixture intelligenceSourceV2ConsentFixture, chatID string, grants map[string]bool) (string, string) {
	t.Helper()
	ctx := context.Background()
	var installationID string
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT id FROM public.intelligence_installations WHERE family_id=$1 AND enabled`, fixture.familyID).Scan(&installationID); err != nil {
		t.Fatalf("find synthetic Intelligence installation: %v", err)
	}
	connectionID := "source-v2-policy-connection-" + uuid.NewString()
	credential := "synthetic-source-v2-credential-" + uuid.NewString()
	digest := sha256.Sum256([]byte(credential))
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_connections(id,installation_id,principal_user_id,credential_hash,enabled,credential_expires_at) VALUES($1,$2,$3,$4,true,now()+interval '30 days')`, connectionID, installationID, fixture.userID, digest[:]); err != nil {
		t.Fatalf("insert synthetic source v2 connection: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_connection_chats(connection_id,chat_id) VALUES($1,$2)`, connectionID, chatID); err != nil {
		t.Fatalf("insert synthetic source v2 chat scope: %v", err)
	}
	for _, grant := range []string{"read", "process", "external_transfer", "export"} {
		if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_connection_grants(connection_id,grant_type,granted,granted_at) VALUES($1,$2,$3,CASE WHEN $3 THEN now() ELSE NULL END)`, connectionID, grant, grants[grant]); err != nil {
			t.Fatalf("insert synthetic %s grant: %v", grant, err)
		}
	}
	return connectionID, credential
}

func sourceV2AuthorizationDecision(t *testing.T, fixture intelligenceSourceV2ConsentFixture, credential, resourceID, operation string) sourceV2AuthorizationTestDecision {
	t.Helper()
	response := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/source/authorization:check", credential, map[string]any{"schema_version": "v2", "resource_ids": []string{resourceID}, "operation": operation})
	defer func() { _ = response.Body.Close() }()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read v2 authorization response: %v", err)
	}
	var envelope struct {
		SchemaVersion string                              `json:"schema_version"`
		Decisions     []sourceV2AuthorizationTestDecision `json:"decisions"`
	}
	if response.StatusCode != http.StatusOK || response.Header.Get("Cache-Control") != "no-store" || json.Unmarshal(body, &envelope) != nil || envelope.SchemaVersion != "v2" || len(envelope.Decisions) != 1 {
		t.Fatalf("authorization %s/%s status=%d cache=%q body=%s", resourceID, operation, response.StatusCode, response.Header.Get("Cache-Control"), body)
	}
	if strings.Contains(string(body), credential) {
		t.Fatal("source credential was echoed in authorization response")
	}
	return envelope.Decisions[0]
}

func sourceV2Request(t *testing.T, client *http.Client, method, target, bearer string, body any) *http.Response {
	t.Helper()
	var encoded io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("encode source v2 request: %v", err)
		}
		encoded = strings.NewReader(string(data))
	}
	request, err := http.NewRequest(method, target, encoded)
	if err != nil {
		t.Fatalf("create source v2 request: %v", err)
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if bearer != "" {
		request.Header.Set("Authorization", "Bearer "+bearer)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("send source v2 request: %v", err)
	}
	return response
}

func sourceV2TokenRequest(t *testing.T, fixture intelligenceSourceV2ConsentFixture, grantType, codeOrCredential, verifier, connectionID string) *http.Response {
	t.Helper()
	return sourceV2TokenRequestWithSecret(t, fixture, grantType, codeOrCredential, verifier, connectionID, fixture.clientSecret)
}

func sourceV2TokenRequestWithSecret(t *testing.T, fixture intelligenceSourceV2ConsentFixture, grantType, codeOrCredential, verifier, connectionID, clientSecret string) *http.Response {
	t.Helper()
	form := url.Values{"grant_type": {grantType}, "redirect_uri": {fixture.redirectURI}}
	if grantType == "authorization_code" {
		form.Set("code", codeOrCredential)
		form.Set("code_verifier", verifier)
	} else {
		form.Set("source_credential", codeOrCredential)
		form.Set("connection_id", connectionID)
	}
	request, err := http.NewRequest(http.MethodPost, fixture.serverURL+"/api/v2/intelligence/token", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatalf("create source v2 token request: %v", err)
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.SetBasicAuth(fixture.clientID, clientSecret)
	response, err := fixture.httpClient.Do(request)
	if err != nil {
		t.Fatalf("send source v2 token request: %v", err)
	}
	return response
}

func sourceV2RotationRequest(t *testing.T, fixture intelligenceSourceV2ConsentFixture, connectionID, oldCredential string) *http.Response {
	t.Helper()
	return sourceV2TokenRequest(t, fixture, "urn:stovo:intelligence:source-credential-rotation", oldCredential, "", connectionID)
}
