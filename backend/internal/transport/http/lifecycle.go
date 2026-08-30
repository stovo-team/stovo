package http

import (
	"context"
	"errors"
	"io"
	stdhttp "net/http"
	"time"
)

// Listener is the small listener lifecycle used by Run. Keeping it here lets
// the process entrypoint remain a composition concern rather than owning HTTP
// serving and shutdown policy itself.
type Listener interface {
	ListenAndServe() error
	Shutdown(context.Context) error
}

// Lifecycle represents the application/runtime resources that must stop only
// after the HTTP transport has stopped accepting requests.
type Lifecycle interface {
	io.Closer
}

// Run serves until the supplied context is cancelled, then drains the HTTP
// listener before closing the composed application runtime. A normal HTTP
// server shutdown is not treated as a serving failure.
func Run(ctx context.Context, listener Listener, runtime Lifecycle, shutdownTimeout time.Duration) error {
	if shutdownTimeout <= 0 {
		shutdownTimeout = 10 * time.Second
	}

	serveResult := make(chan error, 1)
	go func() {
		serveResult <- listener.ListenAndServe()
	}()

	select {
	case err := <-serveResult:
		closeErr := runtime.Close()
		if errors.Is(err, stdhttp.ErrServerClosed) {
			return closeErr
		}
		return errors.Join(err, closeErr)
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		shutdownErr := listener.Shutdown(shutdownCtx)
		closeErr := runtime.Close()
		return errors.Join(shutdownErr, closeErr)
	}
}
