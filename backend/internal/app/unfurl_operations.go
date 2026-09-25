package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type UnfurlResponse struct {
	URL         string `json:"url"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Image       string `json:"image,omitempty"`
	SiteName    string `json:"siteName,omitempty"`
	Favicon     string `json:"favicon,omitempty"`
	MediaType   string `json:"mediaType,omitempty"`
}

var (
	metaPropertyRegex = regexp.MustCompile(`(?i)<meta\s+[^>]*?(?:property|name)=["']([^"']+)["'][^>]*?content=["']([^"']+)["'][^>]*?>|<meta\s+[^>]*?content=["']([^"']+)["'][^>]*?(?:property|name)=["']([^"']+)["'][^>]*?>`)
	titleTagRegex     = regexp.MustCompile(`(?i)<title[^>]*>([^<]+)</title>`)
	linkIconRegex     = regexp.MustCompile(`(?i)<link\s+[^>]*?rel=["'](?:shortcut\s+)?icon["'][^>]*?href=["']([^"']+)["'][^>]*?>|<link\s+[^>]*?href=["']([^"']+)["'][^>]*?rel=["'](?:shortcut\s+)?icon["'][^>]*?>`)
)

func isSafeIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() {
		return false
	}
	ip4 := ip.To4()
	if ip4 != nil {
		if ip4[0] == 127 || ip4[0] == 10 || ip4[0] == 0 {
			return false
		}
		if ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31 {
			return false
		}
		if ip4[0] == 192 && ip4[1] == 168 {
			return false
		}
		if ip4[0] == 169 && ip4[1] == 254 {
			return false
		}
	}
	return true
}

func validateAndCheckSSRF(targetURL string) (*url.URL, error) {
	parsed, err := url.Parse(targetURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, errors.New("invalid protocol")
	}
	hostname := parsed.Hostname()
	if hostname == "" {
		return nil, errors.New("empty host")
	}
	if strings.EqualFold(hostname, "localhost") {
		return nil, errors.New("localhost blocked")
	}

	ip := net.ParseIP(hostname)
	if ip != nil {
		if !isSafeIP(ip) {
			return nil, errors.New("ip address not allowed")
		}
		return parsed, nil
	}

	addrs, err := net.LookupIP(hostname)
	if err != nil || len(addrs) == 0 {
		return nil, errors.New("could not resolve host")
	}

	for _, addr := range addrs {
		if !isSafeIP(addr) {
			return nil, fmt.Errorf("resolved unsafe ip: %s", addr.String())
		}
	}

	return parsed, nil
}

func createSafeHTTPClient() *http.Client {
	dialer := &net.Dialer{
		Timeout: 3 * time.Second,
	}

	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}

			ip := net.ParseIP(host)
			if ip != nil {
				if !isSafeIP(ip) {
					return nil, errors.New("dial target ip not allowed")
				}
			} else {
				addrs, err := net.LookupIP(host)
				if err != nil || len(addrs) == 0 {
					return nil, errors.New("dial target resolve failed")
				}
				for _, a := range addrs {
					if !isSafeIP(a) {
						return nil, errors.New("dial target resolved unsafe ip")
					}
				}
			}

			return dialer.DialContext(ctx, network, net.JoinHostPort(host, port))
		},
		ResponseHeaderTimeout: 4 * time.Second,
		TLSHandshakeTimeout:   3 * time.Second,
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   5 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("too many redirects")
			}
			_, err := validateAndCheckSSRF(req.URL.String())
			return err
		},
	}

	return client
}

func resolveURL(base *url.URL, ref string) string {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return ""
	}
	parsedRef, err := url.Parse(ref)
	if err != nil {
		return ref
	}
	resolved := base.ResolveReference(parsedRef)
	return resolved.String()
}

func parseOpenGraphHTML(base *url.URL, htmlContent string) UnfurlResponse {
	metaMap := make(map[string]string)

	matches := metaPropertyRegex.FindAllStringSubmatch(htmlContent, -1)
	for _, m := range matches {
		var key, val string
		if m[1] != "" {
			key = strings.ToLower(m[1])
			val = m[2]
		} else {
			key = strings.ToLower(m[4])
			val = m[3]
		}
		if key != "" && val != "" {
			metaMap[key] = html.UnescapeString(strings.TrimSpace(val))
		}
	}

	title := metaMap["og:title"]
	if title == "" {
		title = metaMap["twitter:title"]
	}
	if title == "" {
		titleMatch := titleTagRegex.FindStringSubmatch(htmlContent)
		if len(titleMatch) > 1 {
			title = html.UnescapeString(strings.TrimSpace(titleMatch[1]))
		}
	}

	description := metaMap["og:description"]
	if description == "" {
		description = metaMap["twitter:description"]
	}
	if description == "" {
		description = metaMap["description"]
	}

	image := metaMap["og:image"]
	if image == "" {
		image = metaMap["og:image:url"]
	}
	if image == "" {
		image = metaMap["twitter:image"]
	}
	if image != "" {
		image = resolveURL(base, image)
	}

	siteName := metaMap["og:site_name"]
	if siteName == "" {
		siteName = base.Hostname()
	}

	mediaType := metaMap["og:type"]
	if mediaType == "" {
		mediaType = "website"
	}

	var favicon string
	iconMatch := linkIconRegex.FindStringSubmatch(htmlContent)
	if len(iconMatch) > 1 {
		rawFavicon := iconMatch[1]
		if rawFavicon == "" && len(iconMatch) > 2 {
			rawFavicon = iconMatch[2]
		}
		if rawFavicon != "" {
			favicon = resolveURL(base, rawFavicon)
		}
	}
	if favicon == "" {
		favicon = resolveURL(base, "/favicon.ico")
	}

	return UnfurlResponse{
		URL:         base.String(),
		Title:       title,
		Description: description,
		Image:       image,
		SiteName:    siteName,
		Favicon:     favicon,
		MediaType:   mediaType,
	}
}

func (s *Server) handleUnfurl(w http.ResponseWriter, r *http.Request, _ userPublic) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rawURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if rawURL == "" {
		http.Error(w, "Missing url parameter", http.StatusBadRequest)
		return
	}

	parsedURL, err := validateAndCheckSSRF(rawURL)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid or forbidden URL: %v", err), http.StatusBadRequest)
		return
	}

	cacheHash := sha256.Sum256([]byte(parsedURL.String()))
	cacheKey := "unfurl:v1:" + hex.EncodeToString(cacheHash[:])

	ctx := r.Context()
	if cachedVal, err := s.cache.Get(ctx, cacheKey); err == nil && cachedVal != nil {
		var resp UnfurlResponse
		var jsonBytes []byte

		switch v := cachedVal.(type) {
		case string:
			jsonBytes = []byte(v)
		case []byte:
			jsonBytes = v
		default:
			jsonBytes, _ = json.Marshal(v)
		}

		if len(jsonBytes) > 0 && json.Unmarshal(jsonBytes, &resp) == nil {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(jsonBytes)
			return
		}
	}

	client := createSafeHTTPClient()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsedURL.String(), nil)
	if err != nil {
		http.Error(w, "Could not build request", http.StatusInternalServerError)
		return
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; StovoBot/1.0; +https://stovo.app; OpenGraph Link Unfurler)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch URL: %v", err), http.StatusBadGateway)
		return
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		http.Error(w, fmt.Sprintf("Upstream returned status %d", resp.StatusCode), http.StatusBadGateway)
		return
	}

	limitedReader := io.LimitReader(resp.Body, 1024*1024)
	bodyBytes, err := io.ReadAll(limitedReader)
	if err != nil {
		http.Error(w, "Failed to read response body", http.StatusInternalServerError)
		return
	}

	unfurlResult := parseOpenGraphHTML(parsedURL, string(bodyBytes))

	encodedBytes, err := json.Marshal(unfurlResult)
	if err == nil {
		_ = s.cache.Set(ctx, cacheKey, string(encodedBytes), 86400)
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(encodedBytes)
}
