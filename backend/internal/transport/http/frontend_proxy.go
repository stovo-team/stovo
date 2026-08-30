package http

import (
	"context"
	"errors"
	"io"
	stdhttp "net/http"
	"net/url"
	"strings"
	"time"
)

// ProxyLogger is the small logging capability required by the frontend
// fallback. The application composition root supplies its concrete logger.
type ProxyLogger interface {
	Warnf(loggerName, format string, args ...any)
}

// NewFrontendProxy creates the historical GET/HEAD frontend fallback without
// making the application runtime own HTTP-client or URL construction.
// Invalid origins deliberately result in the same 502 response as before.
func NewFrontendProxy(origin string, logger ProxyLogger) stdhttp.Handler {
	target, err := url.Parse(origin)
	if err != nil {
		return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, _ *stdhttp.Request) {
			stdhttp.Error(w, "Frontend is not available", stdhttp.StatusBadGateway)
		})
	}
	client := &stdhttp.Client{
		Timeout: 15 * time.Second,
		CheckRedirect: func(*stdhttp.Request, []*stdhttp.Request) error {
			return stdhttp.ErrUseLastResponse
		},
	}
	return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		targetURL := target.ResolveReference(&url.URL{Path: r.URL.Path, RawPath: r.URL.RawPath, RawQuery: r.URL.RawQuery})
		request, err := stdhttp.NewRequestWithContext(r.Context(), r.Method, targetURL.String(), nil)
		if err != nil {
			logger.Warnf("frontend.proxy", "proxy request build failed target=%s error=%v", targetURL.String(), err)
			stdhttp.Error(w, "Frontend is not available", stdhttp.StatusBadGateway)
			return
		}
		copyProxyHeaders(request.Header, r.Header)
		request.Host = target.Host

		response, err := client.Do(request)
		if err != nil {
			logger.Warnf("frontend.proxy", "proxy failure target=%s error=%v", targetURL.String(), err)
			stdhttp.Error(w, "Frontend is not available", stdhttp.StatusBadGateway)
			return
		}
		defer response.Body.Close()
		copyProxyHeaders(w.Header(), response.Header)
		w.WriteHeader(response.StatusCode)
		if r.Method == stdhttp.MethodHead {
			return
		}
		if _, err := io.Copy(w, response.Body); err != nil && !errors.Is(err, context.Canceled) {
			logger.Warnf("frontend.proxy", "proxy response copy failed target=%s error=%v", targetURL.String(), err)
		}
	})
}

var proxyHopByHopHeaders = map[string]struct{}{
	"connection": {}, "keep-alive": {}, "proxy-authenticate": {}, "proxy-authorization": {},
	"te": {}, "trailers": {}, "transfer-encoding": {}, "upgrade": {}, "host": {}, "content-length": {},
}

func copyProxyHeaders(target, source stdhttp.Header) {
	for key, values := range source {
		if _, skip := proxyHopByHopHeaders[strings.ToLower(key)]; skip {
			continue
		}
		for _, value := range values {
			target.Add(key, value)
		}
	}
}
