package config

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var (
	envMu sync.Mutex
)

// LoadEnv attempts to find and load the nearest .env file into the process environment
// without overwriting existing environment variables.
func LoadEnv() error {
	envMu.Lock()
	defer envMu.Unlock()

	candidates := candidateEnvPaths()
	for _, path := range candidates {
		if path == "" {
			continue
		}
		if fi, err := os.Stat(path); err == nil && !fi.IsDir() {
			return loadEnvFileInternal(path, false)
		}
	}
	return nil
}

// ReloadEnv forces re-reading candidate .env files and applying values to environment variables.
func ReloadEnv() {
	envMu.Lock()
	defer envMu.Unlock()

	candidates := candidateEnvPaths()
	for _, path := range candidates {
		if path == "" {
			continue
		}
		if fi, err := os.Stat(path); err == nil && !fi.IsDir() {
			_ = loadEnvFileInternal(path, true)
		}
	}
}

// IsPlaceholderKey returns true if the value is a dummy/placeholder API key.
func IsPlaceholderKey(val string) bool {
	v := strings.TrimSpace(strings.ToLower(val))
	if v == "" {
		return true
	}
	if v == "gsk_your_groq_api_key_here" ||
		v == "your_groq_api_key_here" ||
		v == "change_me" ||
		v == "change_me_too" ||
		v == "your_api_key_here" ||
		v == "xxx" ||
		strings.HasPrefix(v, "gsk_your_") ||
		strings.Contains(v, "<your_") ||
		strings.Contains(v, "placeholder") {
		return true
	}
	return false
}

// GetOrReloadEnv returns os.Getenv(key). If empty or placeholder, it attempts to reload .env and returns the resulting value.
func GetOrReloadEnv(key string) string {
	val := strings.TrimSpace(os.Getenv(key))
	if val != "" && !IsPlaceholderKey(val) {
		return val
	}
	ReloadEnv()
	val = strings.TrimSpace(os.Getenv(key))
	if IsPlaceholderKey(val) {
		return ""
	}
	return val
}

func candidateEnvPaths() []string {
	var paths []string

	if custom := os.Getenv("ENV_FILE"); strings.TrimSpace(custom) != "" {
		paths = append(paths, strings.TrimSpace(custom))
	}
	if custom := os.Getenv("DOTENV_PATH"); strings.TrimSpace(custom) != "" {
		paths = append(paths, strings.TrimSpace(custom))
	}

	// Check current directory and parents up to 6 levels
	dir, err := os.Getwd()
	if err == nil {
		current := dir
		for i := 0; i < 6; i++ {
			paths = append(paths, filepath.Join(current, ".env"))
			paths = append(paths, filepath.Join(current, "backend", ".env"))
			parent := filepath.Dir(current)
			if parent == current {
				break
			}
			current = parent
		}
	}

	// Executable dir and parents up to 6 levels
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		current := exeDir
		for i := 0; i < 6; i++ {
			paths = append(paths, filepath.Join(current, ".env"))
			parent := filepath.Dir(current)
			if parent == current {
				break
			}
			current = parent
		}
	}

	// User home directory
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		paths = append(paths, filepath.Join(home, ".stovo", ".env"))
		paths = append(paths, filepath.Join(home, ".env"))
	}

	// Common container and fallback paths
	paths = append(paths, ".env", "../.env", "../../.env", "../../../.env", "/app/.env", "/app/backend/.env", "/etc/stovo/.env")

	// Deduplicate preserving order
	seen := make(map[string]bool)
	var unique []string
	for _, p := range paths {
		cleaned := filepath.Clean(p)
		if !seen[cleaned] {
			seen[cleaned] = true
			unique = append(unique, cleaned)
		}
	}
	return unique
}

// LoadEnvFile loads a specific .env file path. If overwrite is true, existing environment variables are overridden.
func LoadEnvFile(path string, overwrite bool) error {
	envMu.Lock()
	defer envMu.Unlock()
	return loadEnvFileInternal(path, overwrite)
}

func loadEnvFileInternal(path string, overwrite bool) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer func() { _ = file.Close() }()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		key, val, ok := parseEnvLine(line)
		if !ok {
			continue
		}
		if overwrite || os.Getenv(key) == "" {
			_ = os.Setenv(key, val)
		}
	}
	return scanner.Err()
}

// ParseEnv parses the string content of a .env file into key-value pairs.
func ParseEnv(content string) map[string]string {
	result := make(map[string]string)
	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		k, v, ok := parseEnvLine(scanner.Text())
		if ok {
			result[k] = v
		}
	}
	return result
}

func parseEnvLine(line string) (string, string, bool) {
	// Strip UTF-8 BOM if present
	line = strings.TrimPrefix(line, "\xef\xbb\xbf")
	trimmed := strings.TrimSpace(line)

	if trimmed == "" || strings.HasPrefix(trimmed, "#") {
		return "", "", false
	}

	// Strip optional "export " prefix
	if strings.HasPrefix(trimmed, "export ") {
		trimmed = strings.TrimSpace(strings.TrimPrefix(trimmed, "export "))
	}

	idx := strings.IndexByte(trimmed, '=')
	if idx <= 0 {
		return "", "", false
	}

	key := strings.TrimSpace(trimmed[:idx])
	val := strings.TrimSpace(trimmed[idx+1:])

	if key == "" {
		return "", "", false
	}

	// Parse quoted or unquoted value
	val = unquoteEnvVal(val)

	return key, val, true
}

func unquoteEnvVal(val string) string {
	val = strings.TrimSpace(val)
	if len(val) == 0 {
		return ""
	}

	// Handle inline comment if not starting with quote
	if val[0] != '"' && val[0] != '\'' {
		if hashIdx := strings.Index(val, " #"); hashIdx >= 0 {
			val = strings.TrimSpace(val[:hashIdx])
		} else if strings.HasPrefix(val, "#") {
			return ""
		}
	} else {
		// If quoted, find matching end quote and ignore any comment after it
		q := val[0]
		endQuote := -1
		for i := 1; i < len(val); i++ {
			if val[i] == q && val[i-1] != '\\' {
				endQuote = i
				break
			}
		}
		if endQuote != -1 {
			val = strings.TrimSpace(val[:endQuote+1])
		}
	}

	if len(val) >= 2 {
		if val[0] == '"' && val[len(val)-1] == '"' {
			inner := val[1 : len(val)-1]
			// Expand escape sequences in double-quoted strings
			inner = strings.ReplaceAll(inner, `\n`, "\n")
			inner = strings.ReplaceAll(inner, `\r`, "\r")
			inner = strings.ReplaceAll(inner, `\t`, "\t")
			inner = strings.ReplaceAll(inner, `\"`, `"`)
			inner = strings.ReplaceAll(inner, `\\`, `\`)
			return strings.TrimSpace(inner)
		}
		if val[0] == '\'' && val[len(val)-1] == '\'' {
			return strings.TrimSpace(val[1 : len(val)-1])
		}
	}

	return strings.TrimSpace(val)
}
