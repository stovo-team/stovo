package http

import (
	"bufio"
	"errors"
	"net"
	stdhttp "net/http"
	"net/url"
	"strings"
	"time"
)

// RequestLogger is the only logging capability required by the HTTP transport.
// The composition root supplies the concrete logger.
type RequestLogger interface {
	Infof(loggerName, format string, args ...any)
}

// CORS only grants browser access to explicitly configured origins. In
// particular, it never reflects an Origin supplied by the caller: doing so
// together with credentials allows an arbitrary website to read cookie-backed
// responses.
func CORS(appURL string, additionalOrigins ...string) func(stdhttp.Handler) stdhttp.Handler {
	allowedOrigins := allowedOriginSet(appURL, additionalOrigins...)
	return func(next stdhttp.Handler) stdhttp.Handler {
		return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
			origin := normalizeRequestOrigin(r.Header.Get("Origin"))
			if origin == "" {
				// A request without Origin is not a CORS request. Do not emit CORS
				// headers for it; this keeps non-browser clients working without
				// accidentally widening browser access.
				next.ServeHTTP(w, r)
				return
			}

			w.Header().Add("Vary", "Origin")
			if _, ok := allowedOrigins[origin]; !ok {
				if r.Method == stdhttp.MethodOptions {
					w.WriteHeader(stdhttp.StatusForbidden)
					return
				}
				next.ServeHTTP(w, r)
				return
			}

			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, Idempotency-Key, X-Refresh-Token, X-Stovo-Media-Token, X-Stovo-Operation-Id, bypass-tunnel-reminder, abypass-tunnel-reminder")
			w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS")
			if r.Method == stdhttp.MethodOptions {
				w.WriteHeader(stdhttp.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// CookieCSRF rejects cross-origin writes to the only routes that authenticate
// with the refresh cookie. The rest of the API uses Authorization: Bearer and
// is therefore not susceptible to cookie CSRF.
func CookieCSRF(cookieName, appURL string, additionalOrigins ...string) func(stdhttp.Handler) stdhttp.Handler {
	allowedOrigins := allowedOriginSet(appURL, additionalOrigins...)
	return func(next stdhttp.Handler) stdhttp.Handler {
		return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
			if !isCookieAuthenticatedWrite(r, cookieName) {
				next.ServeHTTP(w, r)
				return
			}
			origin := normalizeRequestOrigin(r.Header.Get("Origin"))
			if _, ok := allowedOrigins[origin]; !ok {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(stdhttp.StatusForbidden)
				_, _ = w.Write([]byte(`{"detail":"Cross-origin cookie request is not allowed"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func isCookieAuthenticatedWrite(r *stdhttp.Request, cookieName string) bool {
	if r.Method != stdhttp.MethodPost || (r.URL.Path != "/api/auth/refresh" && r.URL.Path != "/api/auth/logout") {
		return false
	}
	_, err := r.Cookie(cookieName)
	return err == nil
}

func allowedOriginSet(appURL string, additionalOrigins ...string) map[string]struct{} {
	allowed := make(map[string]struct{})
	for _, value := range append([]string{appURL}, additionalOrigins...) {
		if origin := normalizeConfiguredOrigin(value); origin != "" {
			allowed[origin] = struct{}{}
		}
	}
	return allowed
}

func normalizeConfiguredOrigin(value string) string {
	u, err := url.Parse(strings.TrimSpace(value))
	if err != nil || u.Scheme == "" || u.Host == "" || u.User != nil {
		return ""
	}
	return strings.ToLower(u.Scheme) + "://" + strings.ToLower(u.Host)
}

func normalizeRequestOrigin(value string) string {
	u, err := url.Parse(strings.TrimSpace(value))
	if err != nil || u.Scheme == "" || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return ""
	}
	return strings.ToLower(u.Scheme) + "://" + strings.ToLower(u.Host)
}

// RequestLogging records the completed request using a narrow logger port.
func RequestLogging(logger RequestLogger) func(stdhttp.Handler) stdhttp.Handler {
	return func(next stdhttp.Handler) stdhttp.Handler {
		return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
			started := time.Now()
			recorder := &statusRecorder{ResponseWriter: w, statusCode: stdhttp.StatusOK}
			next.ServeHTTP(recorder, r)
			logger.Infof("http", "HTTP request completed method=%s path=%s status=%d client=%s duration_ms=%.2f", r.Method, r.URL.Path, recorder.statusCode, r.RemoteAddr, float64(time.Since(started).Microseconds())/1000.0)
		})
	}
}

type statusRecorder struct {
	stdhttp.ResponseWriter
	statusCode int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.statusCode = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := s.ResponseWriter.(stdhttp.Hijacker)
	if !ok {
		return nil, nil, errors.New("response writer does not support hijacking")
	}
	return hijacker.Hijack()
}

func (s *statusRecorder) Flush() {
	if flusher, ok := s.ResponseWriter.(stdhttp.Flusher); ok {
		flusher.Flush()
	}
}

func (s *statusRecorder) Push(target string, opts *stdhttp.PushOptions) error {
	if pusher, ok := s.ResponseWriter.(stdhttp.Pusher); ok {
		return pusher.Push(target, opts)
	}
	return stdhttp.ErrNotSupported
}

func (s *statusRecorder) Unwrap() stdhttp.ResponseWriter { return s.ResponseWriter }
