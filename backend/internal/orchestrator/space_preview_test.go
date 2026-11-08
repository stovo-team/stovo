package orchestrator

import (
	"bytes"
	"image/png"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestSpacePreviewReturnsCrawlerMetadataInInitialHTML(t *testing.T) {
	t.Setenv("APP_URL", "https://stovo.example")
	router := chi.NewRouter()
	orchestrator := &Orchestrator{}
	router.Get("/preview/{slug}", orchestrator.handleSpacePreview)
	request := httptest.NewRequest("GET", "/preview/example-space", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	body := response.Body.String()
	if got := response.Header().Get("Content-Type"); got != "text/html; charset=utf-8" {
		t.Fatalf("Content-Type = %q", got)
	}
	for _, want := range []string{
		`property="og:title" content="Stovo Space | Stovo"`,
		`property="og:image" content="https://stovo.example/s/example-space/og.png"`,
		`property="og:image:type" content="image/png"`,
		`property="og:image:width" content="1200"`,
		`property="og:image:height" content="630"`,
		`property="og:url" content="https://stovo.example/s/example-space"`,
		`name="twitter:card" content="summary_large_image"`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("preview HTML missing %q", want)
		}
	}
	if got := response.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q", got)
	}
}

func TestPublicSpacePreviewEscapesWorkspaceName(t *testing.T) {
	body := renderSpacePreviewHTML("https://stovo.example", "safe-slug", `Ops "&" <script>`, true)
	if strings.Contains(body, "<script>") || strings.Contains(body, `content="Ops "&"`) {
		t.Fatalf("workspace name was not HTML-escaped: %s", body)
	}
	for _, want := range []string{`Ops &#34;&amp;&#34; &lt;script&gt;`, `og:description`} {
		if !strings.Contains(body, want) {
			t.Errorf("escaped preview HTML missing %q", want)
		}
	}
}

func TestNonPublicOrUnnamedSpacesUseGenericPreview(t *testing.T) {
	for _, tc := range []struct {
		name     string
		isPublic bool
	}{
		{name: "Private Family Space", isPublic: false},
		{name: "  ", isPublic: true},
	} {
		if name, ok := publicPreviewName(tc.name, tc.isPublic); ok || name != "" {
			t.Errorf("publicPreviewName(%q, %v) = %q, %v; want empty, false", tc.name, tc.isPublic, name, ok)
		}
	}
	if name, ok := publicPreviewName("  Public Team  ", true); !ok || name != "Public Team" {
		t.Fatalf("publicPreviewName did not return the trimmed public name: %q, %v", name, ok)
	}
}

func TestSpacePreviewImageIsPNGWithDeclaredDimensions(t *testing.T) {
	data, err := renderPreviewPNG("Weekend & Friends")
	if err != nil {
		t.Fatal(err)
	}
	config, err := png.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	if config.Width != previewWidth || config.Height != previewHeight {
		t.Fatalf("dimensions = %dx%d", config.Width, config.Height)
	}
	if len(data) < 1000 {
		t.Fatalf("generated preview image unexpectedly small: %d bytes", len(data))
	}
	image, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("decode rendered preview image: %v", err)
	}
	r, g, b, a := image.At(72, 250).RGBA()
	if r != 0xffff || g != 0xffff || b != 0xffff || a != 0xffff {
		t.Fatalf("expected visible white workspace title pixel, got rgba(%d,%d,%d,%d)", r, g, b, a)
	}
}

func TestPreviewImageNameTransliteratesCyrillic(t *testing.T) {
	if got, want := transliteratePreviewName("МОЯ КОМАНДА"), "MOYA KOMANDA"; got != want {
		t.Fatalf("Cyrillic transliteration = %q, want %q", got, want)
	}
}

func TestSpacePreviewImageHTTPHeadersAndUnavailableFallback(t *testing.T) {
	router := chi.NewRouter()
	router.Get("/preview/{slug}/og.png", (&Orchestrator{}).handleSpacePreviewImage)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/preview/no-such-space/og.png", nil))
	if got := response.Header().Get("Content-Type"); got != "image/png" {
		t.Fatalf("Content-Type = %q", got)
	}
	if got := response.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q", got)
	}
	config, err := png.DecodeConfig(bytes.NewReader(response.Body.Bytes()))
	if err != nil {
		t.Fatalf("decode fallback png: %v", err)
	}
	if config.Width != previewWidth || config.Height != previewHeight {
		t.Fatalf("fallback dimensions = %dx%d", config.Width, config.Height)
	}
}
