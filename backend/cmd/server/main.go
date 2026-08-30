package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"stovo-messenger/backend/internal/app"
	"stovo-messenger/backend/internal/bootstrap"
	"stovo-messenger/backend/internal/config"
	transporthttp "stovo-messenger/backend/internal/transport/http"
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

	httpServer := transporthttp.NewServer(transporthttp.Config{Address: fmt.Sprintf("%s:%d", cfg.Host, cfg.Port), ReadHeaderTimeout: 10 * time.Second}, server.Routes())

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(stop)
	shutdownCtx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		<-stop
		cancel()
	}()
	if err := transporthttp.Run(shutdownCtx, httpServer, server, 10*time.Second); err != nil {
		panic(err)
	}
}
