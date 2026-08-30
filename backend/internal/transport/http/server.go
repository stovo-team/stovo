// Package http is the outer HTTP listener transport. It owns listener
// construction and timeout policy; route handling remains supplied as an
// inbound adapter so no feature or persistence dependency crosses this layer.
package http

import (
	"net/http"
	"time"
)

type Config struct {
	Address           string
	ReadHeaderTimeout time.Duration
}

// NewServer constructs the process HTTP listener around an already-composed
// handler. The default retains the former ten-second header timeout.
func NewServer(config Config, handler http.Handler) *http.Server {
	timeout := config.ReadHeaderTimeout
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	return &http.Server{Addr: config.Address, Handler: handler, ReadHeaderTimeout: timeout}
}
