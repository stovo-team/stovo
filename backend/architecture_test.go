package backend_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

const modulePath = "stovo-messenger/backend"

type listedPackage struct {
	ImportPath string
	Imports    []string
}

// TestOnionDependencyDirection guards the production import graph. It runs as
// a Go test so contributors on Windows receive the same architecture feedback
// as the Bash size-ratchet check in CI.
func TestOnionDependencyDirection(t *testing.T) {
	root := moduleRoot(t)
	command := exec.Command("go", "list", "-json", "./internal/...")
	command.Dir = root
	output, err := command.Output()
	if err != nil {
		t.Fatalf("list internal packages: %v", err)
	}

	decoder := json.NewDecoder(bytes.NewReader(output))
	for {
		var pkg listedPackage
		err := decoder.Decode(&pkg)
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("decode go list output: %v", err)
		}
		assertPackageDependencies(t, pkg)
	}
}

// TestLegacyApplicationDoesNotExposeRepositoryStore prevents the compatibility
// application shell from becoming a second persistence composition root. The
// shell may hold feature services, but concrete repository types must stop at
// bootstrap/adapters.
func TestLegacyApplicationDoesNotExposeRepositoryStore(t *testing.T) {
	root := moduleRoot(t)
	for _, name := range []string{"dependencies.go", "server.go"} {
		path := filepath.Join(root, "internal", "app", name)
		contents, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		if bytes.Contains(contents, []byte("internal/repository")) ||
			bytes.Contains(contents, []byte("repository.Store")) ||
			bytes.Contains(contents, []byte("\"stovo-messenger/backend/ent\"")) {
			t.Errorf("legacy application file %s exposes repository/ent persistence; depend on feature ports instead", path)
		}
	}
}

// TestPersistenceConstructionStaysInBootstrap catches accidental construction
// of the concrete Ent/repository/Redis graph from a handler, transport, or
// feature. Schema orchestration may open its own migration connection, so the
// check intentionally targets application persistence clients only.
func TestPersistenceConstructionStaysInBootstrap(t *testing.T) {
	root := moduleRoot(t)
	forbidden := []string{"ent.NewClient(", "repository.New(", "redis.NewClient("}
	err := filepath.WalkDir(filepath.Join(root, "internal"), func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") || strings.HasSuffix(entry.Name(), "_test.go") {
			return nil
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		if strings.HasPrefix(filepath.ToSlash(relative), "internal/bootstrap/") {
			return nil
		}
		contents, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, token := range forbidden {
			if bytes.Contains(contents, []byte(token)) {
				t.Errorf("concrete persistence construction %q belongs in internal/bootstrap, found in %s", token, relative)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("scan production source: %v", err)
	}
}

func moduleRoot(t *testing.T) string {
	t.Helper()
	directory, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory: %v", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(directory, "go.mod")); err == nil {
			return directory
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			t.Fatal("could not locate backend go.mod")
		}
		directory = parent
	}
}

func assertPackageDependencies(t *testing.T, pkg listedPackage) {
	t.Helper()
	switch {
	case strings.HasPrefix(pkg.ImportPath, modulePath+"/internal/domain"):
		for _, imported := range pkg.Imports {
			if strings.HasPrefix(imported, modulePath+"/internal/") && !strings.HasPrefix(imported, modulePath+"/internal/domain") {
				t.Errorf("domain package %s imports outer package %s", pkg.ImportPath, imported)
			}
			if isFrameworkOrAdapter(imported) {
				t.Errorf("domain package %s imports framework or adapter %s", pkg.ImportPath, imported)
			}
		}
	case strings.HasPrefix(pkg.ImportPath, modulePath+"/internal/features/"):
		for _, imported := range pkg.Imports {
			if isLegacyOuterPackage(imported) || strings.HasPrefix(imported, modulePath+"/ent") || isFrameworkOrAdapter(imported) {
				t.Errorf("feature package %s imports outer dependency %s", pkg.ImportPath, imported)
			}
		}
	case strings.HasPrefix(pkg.ImportPath, modulePath+"/internal/transport/"):
		for _, imported := range pkg.Imports {
			if strings.HasPrefix(imported, modulePath+"/ent") || strings.HasPrefix(imported, modulePath+"/internal/repository") || isRedis(imported) {
				t.Errorf("transport package %s imports persistence implementation %s", pkg.ImportPath, imported)
			}
		}
	case pkg.ImportPath == modulePath+"/internal/app":
		for _, imported := range pkg.Imports {
			if strings.HasPrefix(imported, modulePath+"/ent") || strings.HasPrefix(imported, modulePath+"/internal/repository") {
				t.Errorf("application facade package %s imports persistence implementation %s", pkg.ImportPath, imported)
			}
		}
	}
}

func isLegacyOuterPackage(imported string) bool {
	for _, name := range []string{"app", "bootstrap", "repository", "ports", "storage", "broker", "cache", "logging", "tunnel", "config", "adapters", "transport", "runtime"} {
		if imported == fmt.Sprintf("%s/internal/%s", modulePath, name) || strings.HasPrefix(imported, fmt.Sprintf("%s/internal/%s/", modulePath, name)) {
			return true
		}
	}
	return false
}

func isFrameworkOrAdapter(imported string) bool {
	return imported == "database/sql" ||
		strings.HasPrefix(imported, "entgo.io/") ||
		strings.HasPrefix(imported, "github.com/go-chi/") ||
		strings.HasPrefix(imported, "github.com/redis/") ||
		strings.HasPrefix(imported, "github.com/doquangtan/socketio/") ||
		strings.HasPrefix(imported, "github.com/minio/") ||
		strings.HasPrefix(imported, "github.com/gofiber/") ||
		isRedis(imported)
}

func isRedis(imported string) bool {
	return strings.HasPrefix(imported, "github.com/redis/")
}
