package ocisecret

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeReader struct {
	versions map[int64]map[string]string
	err      error
}

func (f *fakeReader) ReadVersion(ctx context.Context, version int64) (map[string]string, error) {
	if f.err != nil {
		return nil, f.err
	}
	v, ok := f.versions[version]
	if !ok {
		return nil, fmt.Errorf("secret version %d not found", version)
	}
	return v, nil
}

func TestAdapterGetSecretSuccess(t *testing.T) {
	reader := &fakeReader{
		versions: map[int64]map[string]string{
			1: {
				"POSTGRES_PASSWORD": "synthetic-db-pass",
				"MINIO_ROOT_SECRET": "synthetic-minio-secret",
			},
		},
	}

	adapter := NewAdapter(Config{
		Reader:        reader,
		SecretOCID:    "ocid1.vaultsecret.oc1..synthetic",
		AllowlistKeys: []string{"POSTGRES_PASSWORD", "MINIO_ROOT_SECRET"},
		AuthToken:     "test-token",
	})

	handler := adapter.Handler()

	req := httptest.NewRequest(http.MethodGet, "/v1/secrets/1/POSTGRES_PASSWORD", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: body=%s", rr.Code, http.StatusOK, rr.Body.String())
	}

	var res struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if res.Value != "synthetic-db-pass" {
		t.Errorf("value = %q, want %q", res.Value, "synthetic-db-pass")
	}
}

func TestAdapterRejectsUnauthorizedToken(t *testing.T) {
	reader := &fakeReader{
		versions: map[int64]map[string]string{
			1: {"POSTGRES_PASSWORD": "secret"},
		},
	}
	adapter := NewAdapter(Config{
		Reader:        reader,
		SecretOCID:    "ocid1.vaultsecret.oc1..synthetic",
		AllowlistKeys: []string{"POSTGRES_PASSWORD"},
		AuthToken:     "correct-token",
	})

	handler := adapter.Handler()

	req := httptest.NewRequest(http.MethodGet, "/v1/secrets/1/POSTGRES_PASSWORD", nil)
	req.Header.Set("Authorization", "Bearer wrong-token")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

func TestAdapterRejectsNonNumericOrZeroVersion(t *testing.T) {
	reader := &fakeReader{
		versions: map[int64]map[string]string{
			1: {"POSTGRES_PASSWORD": "secret"},
		},
	}
	adapter := NewAdapter(Config{
		Reader:        reader,
		SecretOCID:    "ocid1.vaultsecret.oc1..synthetic",
		AllowlistKeys: []string{"POSTGRES_PASSWORD"},
		AuthToken:     "test-token",
	})

	handler := adapter.Handler()

	for _, path := range []string{
		"/v1/secrets/0/POSTGRES_PASSWORD",
		"/v1/secrets/-1/POSTGRES_PASSWORD",
		"/v1/secrets/latest/POSTGRES_PASSWORD",
		"/v1/secrets/abc/POSTGRES_PASSWORD",
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer test-token")
		rr := httptest.NewRecorder()

		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("path %s status = %d, want %d", path, rr.Code, http.StatusBadRequest)
		}
	}
}

func TestAdapterRejectsNonAllowlistedKey(t *testing.T) {
	reader := &fakeReader{
		versions: map[int64]map[string]string{
			1: {
				"POSTGRES_PASSWORD": "secret",
				"PRIVATE_KEY":       "secret-key",
			},
		},
	}
	adapter := NewAdapter(Config{
		Reader:        reader,
		SecretOCID:    "ocid1.vaultsecret.oc1..synthetic",
		AllowlistKeys: []string{"POSTGRES_PASSWORD"},
		AuthToken:     "test-token",
	})

	handler := adapter.Handler()

	req := httptest.NewRequest(http.MethodGet, "/v1/secrets/1/PRIVATE_KEY", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusForbidden)
	}
}

func TestAdapterRejectsMissingKeyOrUpstreamFailureFailsClosedWithoutLoggingSecret(t *testing.T) {
	reader := &fakeReader{
		err: errors.New("upstream OCI timeout"),
	}
	adapter := NewAdapter(Config{
		Reader:        reader,
		SecretOCID:    "ocid1.vaultsecret.oc1..synthetic",
		AllowlistKeys: []string{"POSTGRES_PASSWORD"},
		AuthToken:     "test-token",
	})

	handler := adapter.Handler()

	req := httptest.NewRequest(http.MethodGet, "/v1/secrets/1/POSTGRES_PASSWORD", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
	}
	if strings.Contains(rr.Body.String(), "synthetic") {
		t.Fatalf("response disclosed synthetic secret: %s", rr.Body.String())
	}
}
