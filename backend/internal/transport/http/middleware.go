package http

import (
	"bufio"
	"errors"
	"net"
	stdhttp "net/http"
	"time"
)

// RequestLogger is the only logging capability required by the HTTP transport.
// The composition root supplies the concrete logger.
type RequestLogger interface {
	Infof(loggerName, format string, args ...any)
}

// CORS adds the historical browser compatibility headers. Origins continue to
// be reflected exactly as before, falling back to appURL for non-browser calls.
func CORS(appURL string) func(stdhttp.Handler) stdhttp.Handler {
	return func(next stdhttp.Handler) stdhttp.Handler {
		return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
			origin := r.Header.Get("Origin")
			if origin == "" {
				origin = appURL
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, Idempotency-Key, X-Refresh-Token, X-Stovo-Media-Token, X-Stovo-Operation-Id, bypass-tunnel-reminder, abypass-tunnel-reminder")
			w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS")
			if r.Method == stdhttp.MethodOptions {
				w.WriteHeader(stdhttp.StatusOK)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
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
