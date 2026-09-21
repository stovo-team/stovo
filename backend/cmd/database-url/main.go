// Command database-url prints the configured PostgreSQL URL for deployment
// tooling. It keeps URL escaping in the same outer configuration boundary as
// the application, rather than duplicating it in shell scripts.
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/url"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"stovo-messenger/backend/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	primaryURL := cfg.EffectiveDatabaseURL()

	if strings.TrimSpace(cfg.DatabaseURL) != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		db, err := sql.Open("pgx", primaryURL)
		if err == nil {
			defer db.Close()
			pingErr := db.PingContext(ctx)
			if pingErr == nil {
				fmt.Print(primaryURL)
				return
			}
			log.Printf("[database-url] WARNING: external database is unreachable (%v), switching to local fallback", pingErr)
		} else {
			log.Printf("[database-url] WARNING: cannot open external database (%v), switching to local fallback", err)
		}

		// Primary unreachable, find working fallback
		candidates := cfg.LocalFallbackCandidates()
		for _, fallbackURL := range candidates {
			if fallbackURL == primaryURL {
				continue
			}
			fctx, fcancel := context.WithTimeout(context.Background(), 2*time.Second)
			fdb, ferr := sql.Open("pgx", fallbackURL)
			if ferr == nil {
				if fdb.PingContext(fctx) == nil {
					_ = fdb.Close()
					fcancel()
					log.Printf("[database-url] using verified local fallback: %s", redact(fallbackURL))
					fmt.Print(fallbackURL)
					return
				}
				_ = fdb.Close()
			}
			fcancel()
		}

		// If no local candidate responded yet (e.g. starting up), still output local fallback URL
		if len(candidates) > 0 {
			log.Printf("[database-url] WARNING: using local fallback URL: %s", redact(candidates[0]))
			fmt.Print(candidates[0])
			return
		}
	}

	fmt.Print(primaryURL)
}

func redact(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	return u.Redacted()
}
