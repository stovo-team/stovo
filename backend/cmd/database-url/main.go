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
	fallbackURL := cfg.LocalDatabaseURL()

	if strings.TrimSpace(cfg.DatabaseURL) != "" && fallbackURL != "" && primaryURL != fallbackURL {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		db, err := sql.Open("pgx", primaryURL)
		if err == nil {
			defer db.Close()
			if pingErr := db.PingContext(ctx); pingErr != nil {
				log.Printf("[database-url] WARNING: external database is unreachable (%v), falling back to local database: %s", pingErr, redact(fallbackURL))
				fmt.Print(fallbackURL)
				return
			}
		} else {
			log.Printf("[database-url] WARNING: cannot open external database (%v), falling back to local database: %s", err, redact(fallbackURL))
			fmt.Print(fallbackURL)
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
