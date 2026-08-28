package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"stovo-messenger/backend/internal/app"
	"stovo-messenger/backend/internal/bootstrap"
	"stovo-messenger/backend/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	deps, err := bootstrap.BuildDependencies(cfg)
	if err != nil {
		panic(err)
	}
	server, err := app.NewWithDependencies(deps)
	if err != nil {
		panic(err)
	}
	defer server.Close()

	httpServer := &http.Server{
		Addr:              fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
		Handler:           server.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			panic(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdownCtx)
}
