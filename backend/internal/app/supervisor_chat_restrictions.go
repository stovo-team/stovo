package app

import (
	"encoding/json"
	"os"
)

func supervisorAllowsChatType(kind string) bool {
	var configured map[string]bool
	if err := json.Unmarshal([]byte(os.Getenv("CHAT_TYPES")), &configured); err != nil || len(configured) == 0 {
		return true
	}
	allowed, exists := configured[kind]
	return !exists || allowed
}
