package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"stovo-messenger/backend/internal/ocisecret"
)

// InstancePrincipalReader fetches secrets from OCI Vault using Instance Principal credentials.
type InstancePrincipalReader struct {
	secretOCID string
	client     *http.Client
}

// NewInstancePrincipalReader creates a new Reader.
func NewInstancePrincipalReader(secretOCID string) *InstancePrincipalReader {
	return &InstancePrincipalReader{
		secretOCID: secretOCID,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// ReadVersion resolves secret bundle for a specific version.
func (r *InstancePrincipalReader) ReadVersion(ctx context.Context, version int64) (map[string]string, error) {
	// If OCI_SECRET_MOCK_PAYLOAD is supplied (for tests and local stage development), use it.
	if mockPayload := os.Getenv("OCI_SECRET_MOCK_PAYLOAD"); mockPayload != "" {
		var res map[string]string
		if err := json.Unmarshal([]byte(mockPayload), &res); err != nil {
			return nil, fmt.Errorf("invalid mock secret payload: %w", err)
		}
		return res, nil
	}

	// Instance Principal Vault retrieval:
	// OCI Secrets in Vault endpoint: GET /20190302/secretbundles/{secretId}?versionNumber={versionNumber}
	// In production, the adapter calls Secrets in Vault service or local IMDS token session.
	vaultEndpoint := os.Getenv("OCI_VAULT_ENDPOINT")
	if vaultEndpoint == "" {
		return nil, fmt.Errorf("OCI_VAULT_ENDPOINT is not configured")
	}

	url := fmt.Sprintf("%s/20190302/secretbundles/%s?versionNumber=%d", vaultEndpoint, r.secretOCID, version)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("vault request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("vault returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read vault response: %w", err)
	}

	var bundle struct {
		SecretBundleContent struct {
			Content string `json:"content"`
		} `json:"secretBundleContent"`
	}
	if err := json.Unmarshal(body, &bundle); err != nil {
		return nil, fmt.Errorf("unmarshal secret bundle: %w", err)
	}

	decoded, err := base64.StdEncoding.DecodeString(bundle.SecretBundleContent.Content)
	if err != nil {
		return nil, fmt.Errorf("decode secret bundle: %w", err)
	}

	var values map[string]string
	if err := json.Unmarshal(decoded, &values); err != nil {
		return nil, fmt.Errorf("parse secret JSON payload: %w", err)
	}

	return values, nil
}

func main() {
	port := flag.Int("port", 8089, "HTTP listen port")
	secretOCID := flag.String("secret-ocid", os.Getenv("OCI_SECRET_OCID"), "OCI Vault Secret OCID")
	allowlist := flag.String("allowlist", os.Getenv("OCI_SECRET_ALLOWLIST"), "Comma-separated allowlisted keys")
	authToken := flag.String("auth-token", os.Getenv("ADAPTER_AUTH_TOKEN"), "Bearer auth token for adapter requests")
	flag.Parse()

	if *secretOCID == "" && os.Getenv("OCI_SECRET_MOCK_PAYLOAD") == "" {
		log.Fatalf("OCI_SECRET_OCID is required")
	}

	var allowlistKeys []string
	if *allowlist != "" {
		for _, k := range strings.Split(*allowlist, ",") {
			k = strings.TrimSpace(k)
			if k != "" {
				allowlistKeys = append(allowlistKeys, k)
			}
		}
	}

	reader := NewInstancePrincipalReader(*secretOCID)
	adapter := ocisecret.NewAdapter(ocisecret.Config{
		Reader:        reader,
		SecretOCID:    *secretOCID,
		AllowlistKeys: allowlistKeys,
		AuthToken:     *authToken,
		Timeout:       10 * time.Second,
	})

	srv := &http.Server{
		Addr:         fmt.Sprintf("127.0.0.1:%d", *port),
		Handler:      adapter.Handler(),
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("[oci-secret-adapter] listening on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[oci-secret-adapter] server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Printf("[oci-secret-adapter] shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}
