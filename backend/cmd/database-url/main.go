// Command database-url prints the configured PostgreSQL URL for deployment
// tooling. It keeps URL escaping in the same outer configuration boundary as
// the application, rather than duplicating it in shell scripts.
package main

import (
	"fmt"

	"stovo-messenger/backend/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}
	fmt.Print(cfg.EffectiveDatabaseURL())
}
