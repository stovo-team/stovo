package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

type dummyCache struct {
	store map[string]any
}

func newDummyCache() *dummyCache {
	return &dummyCache{store: make(map[string]any)}
}

func (d *dummyCache) Get(_ context.Context, key string) (any, error) {
	val, ok := d.store[key]
	if !ok {
		return nil, nil
	}
	return val, nil
}

func (d *dummyCache) Set(_ context.Context, key string, val any, _ int) error {
	d.store[key] = val
	return nil
}

func (d *dummyCache) Delete(_ context.Context, key string) error {
	delete(d.store, key)
	return nil
}

func (d *dummyCache) Exists(_ context.Context, key string) (bool, error) {
	_, ok := d.store[key]
	return ok, nil
}

func (d *dummyCache) Increment(_ context.Context, _ string, _ int) (int64, error) {
	return 1, nil
}

func TestSSRFProtection(t *testing.T) {
	blockedURLs := []string{
		"http://127.0.0.1/secret",
		"http://localhost/admin",
		"http://10.0.0.1/config",
		"http://192.168.1.1/router",
		"http://172.16.0.1/internal",
		"http://169.254.169.254/latest/meta-data/",
		"http://[::1]/status",
		"ftp://example.com/file",
		"file:///etc/passwd",
	}

	for _, rawURL := range blockedURLs {
		_, err := validateAndCheckSSRF(rawURL)
		if err == nil {
			t.Errorf("expected URL %s to be blocked by SSRF check, but it passed", rawURL)
		}
	}
}

func TestOpenGraphHTMLParsing(t *testing.T) {
	htmlBody := `<!DOCTYPE html>
<html>
<head>
	<meta property="og:title" content="Stovo Messenger - Secure Messaging" />
	<meta property="og:description" content="Stovo is a self-hosted family messenger." />
	<meta property="og:image" content="/assets/og-cover.png" />
	<meta property="og:site_name" content="Stovo" />
	<meta property="og:type" content="article" />
	<link rel="icon" href="/favicon.png" />
</head>
<body><h1>Hello World</h1></body>
</html>`

	baseURL, err := url.Parse("https://stovo.example.com/blog/article-1")
	if err != nil {
		t.Fatalf("failed to parse base URL: %v", err)
	}

	res := parseOpenGraphHTML(baseURL, htmlBody)

	if res.Title != "Stovo Messenger - Secure Messaging" {
		t.Errorf("unexpected title: got %q, want %q", res.Title, "Stovo Messenger - Secure Messaging")
	}
	if res.Description != "Stovo is a self-hosted family messenger." {
		t.Errorf("unexpected description: got %q, want %q", res.Description, "Stovo is a self-hosted family messenger.")
	}
	if res.Image != "https://stovo.example.com/assets/og-cover.png" {
		t.Errorf("unexpected image: got %q, want %q", res.Image, "https://stovo.example.com/assets/og-cover.png")
	}
	if res.SiteName != "Stovo" {
		t.Errorf("unexpected siteName: got %q, want %q", res.SiteName, "Stovo")
	}
	if res.Favicon != "https://stovo.example.com/favicon.png" {
		t.Errorf("unexpected favicon: got %q, want %q", res.Favicon, "https://stovo.example.com/favicon.png")
	}
	if res.MediaType != "article" {
		t.Errorf("unexpected mediaType: got %q, want %q", res.MediaType, "article")
	}
}

func TestOpenGraphHTMLFallbackParsing(t *testing.T) {
	htmlBody := `<!DOCTYPE html>
<html>
<head>
	<title>Fallback Title &amp; More</title>
	<meta name="description" content="Fallback meta description test" />
</head>
<body></body>
</html>`

	baseURL, _ := url.Parse("https://fallback.example.com/page")
	res := parseOpenGraphHTML(baseURL, htmlBody)

	if res.Title != "Fallback Title & More" {
		t.Errorf("unexpected title: got %q, want %q", res.Title, "Fallback Title & More")
	}
	if res.Description != "Fallback meta description test" {
		t.Errorf("unexpected description: got %q, want %q", res.Description, "Fallback meta description test")
	}
	if res.Favicon != "https://fallback.example.com/favicon.ico" {
		t.Errorf("unexpected fallback favicon: got %q, want %q", res.Favicon, "https://fallback.example.com/favicon.ico")
	}
}

func TestHandleUnfurlHandler(t *testing.T) {
	srv := &Server{
		cache: newDummyCache(),
	}

	// 1. Missing URL param
	req1 := httptest.NewRequest(http.MethodGet, "/api/unfurl", nil)
	rec1 := httptest.NewRecorder()
	srv.handleUnfurl(rec1, req1, userPublic{})
	if rec1.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing url, got %d", rec1.Code)
	}

	// 2. Localhost URL param (should be blocked by SSRF)
	req2 := httptest.NewRequest(http.MethodGet, "/api/unfurl?url="+url.QueryEscape("http://127.0.0.1/admin"), nil)
	rec2 := httptest.NewRecorder()
	srv.handleUnfurl(rec2, req2, userPublic{})
	if rec2.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for localhost url, got %d", rec2.Code)
	}

	// 3. Test caching behavior directly
	// A documentation IP keeps this cache-path test independent of external DNS.
	targetURL := "https://203.0.113.10/article"
	parsedURL, _ := url.Parse(targetURL)
	mockRes := parseOpenGraphHTML(parsedURL, `<html><head><meta property="og:title" content="Cached Title"/></head></html>`)
	jsonBytes, _ := json.Marshal(mockRes)

	cacheHash := sha256.Sum256([]byte(parsedURL.String()))
	cacheKey := "unfurl:v2:" + hex.EncodeToString(cacheHash[:])
	_ = srv.cache.Set(context.Background(), cacheKey, string(jsonBytes), 86400)

	req3 := httptest.NewRequest(http.MethodGet, "/api/unfurl?url="+url.QueryEscape(targetURL), nil)
	rec3 := httptest.NewRecorder()
	srv.handleUnfurl(rec3, req3, userPublic{})

	if rec3.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for cached url, got %d", rec3.Code)
	}

	var resp UnfurlResponse
	if err := json.Unmarshal(rec3.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if resp.Title != "Cached Title" {
		t.Errorf("unexpected cached title: got %q, want %q", resp.Title, "Cached Title")
	}
}
