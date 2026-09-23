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

func TestPackageLayerDependencyPolicy(t *testing.T) {
	tests := []struct {
		name    string
		from    string
		to      string
		allowed bool
	}{
		{name: "domain can use domain", from: "domain", to: "domain", allowed: true},
		{name: "domain cannot use feature", from: "domain", to: "features", allowed: false},
		{name: "feature can use domain", from: "features", to: "domain", allowed: true},
		{name: "feature can use another feature", from: "features", to: "features", allowed: true},
		{name: "feature cannot use adapter", from: "features", to: "adapters", allowed: false},
		{name: "feature cannot use support package", from: "features", to: "support", allowed: false},
		{name: "transport cannot use app", from: "transport", to: "outer", allowed: false},
		{name: "transport can use support package", from: "transport", to: "support", allowed: true},
		{name: "transport cannot use adapter", from: "transport", to: "adapters", allowed: false},
		{name: "transport cannot use repository", from: "transport", to: "outer", allowed: false},
		{name: "bootstrap can compose adapters", from: "bootstrap", to: "adapters", allowed: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := allowedLayerDependency(tt.from, tt.to)
			if got != tt.allowed {
				t.Errorf("allowedLayerDependency(%q, %q) = %v, want %v", tt.from, tt.to, got, tt.allowed)
			}
		})
	}
}

func TestPackageLayerClassifiesImportPaths(t *testing.T) {
	tests := []struct {
		importPath string
		want       string
	}{
		{importPath: modulePath + "/internal/domain/message", want: "domain"},
		{importPath: modulePath + "/internal/features/messages", want: "features"},
		{importPath: modulePath + "/internal/transport/http", want: "transport"},
		{importPath: modulePath + "/internal/ports", want: "support"},
		{importPath: modulePath + "/internal/repository", want: "outer"},
		{importPath: modulePath + "/ent/user", want: "outer"},
		{importPath: modulePath + "/internal/domainish", want: "outer"},
		{importPath: "github.com/example/library", want: ""},
	}
	for _, tt := range tests {
		t.Run(tt.importPath, func(t *testing.T) {
			if got := packageLayer(tt.importPath); got != tt.want {
				t.Errorf("packageLayer(%q) = %q, want %q", tt.importPath, got, tt.want)
			}
		})
	}
}

func TestLayerDependencyViolationsInspectPackageImports(t *testing.T) {
	tests := []struct {
		name              string
		pkg               listedPackage
		wantViolations    int
		wantViolationText string
	}{
		{
			name:              "domain cannot import feature",
			pkg:               listedPackage{ImportPath: modulePath + "/internal/domain/message", Imports: []string{modulePath + "/internal/features/messages"}},
			wantViolations:    1,
			wantViolationText: "internal/features/messages",
		},
		{
			name:              "domain cannot import generated ent",
			pkg:               listedPackage{ImportPath: modulePath + "/internal/domain/message", Imports: []string{modulePath + "/ent/user"}},
			wantViolations:    1,
			wantViolationText: "/ent/user",
		},
		{
			name:              "feature cannot import adapter",
			pkg:               listedPackage{ImportPath: modulePath + "/internal/features/messages", Imports: []string{modulePath + "/internal/adapters/messagehistory"}},
			wantViolations:    1,
			wantViolationText: "internal/adapters/messagehistory",
		},
		{
			name:              "transport cannot import repository",
			pkg:               listedPackage{ImportPath: modulePath + "/internal/transport/http", Imports: []string{modulePath + "/internal/repository"}},
			wantViolations:    1,
			wantViolationText: "internal/repository",
		},
		{
			name:           "allowed feature domain import",
			pkg:            listedPackage{ImportPath: modulePath + "/internal/features/messages", Imports: []string{modulePath + "/internal/domain/message"}},
			wantViolations: 0,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := layerDependencyViolations(tt.pkg)
			if len(got) != tt.wantViolations {
				t.Fatalf("layerDependencyViolations() returned %d violations, want %d: %v", len(got), tt.wantViolations, got)
			}
			if tt.wantViolationText != "" && !strings.Contains(got[0], tt.wantViolationText) {
				t.Errorf("violation %q does not identify dependency %q", got[0], tt.wantViolationText)
			}
		})
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
	for _, violation := range layerDependencyViolations(pkg) {
		t.Error(violation)
	}
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

func layerDependencyViolations(pkg listedPackage) []string {
	fromLayer := packageLayer(pkg.ImportPath)
	if fromLayer != "domain" && fromLayer != "features" && fromLayer != "transport" {
		return nil
	}
	var violations []string
	for _, imported := range pkg.Imports {
		toLayer := packageLayer(imported)
		if toLayer == "" {
			continue
		}
		if !allowedLayerDependency(fromLayer, toLayer) {
			violations = append(violations, fmt.Sprintf("package %s in layer %s imports %s in disallowed layer %s", pkg.ImportPath, fromLayer, imported, toLayer))
		}
	}
	return violations
}

// packageLayer groups import paths whose dependency direction is part of the
// backend architecture contract. Everything else is an outer implementation
// package when imported by one of the governed layers.
func packageLayer(importPath string) string {
	if !strings.HasPrefix(importPath, modulePath+"/") {
		return ""
	}
	name := strings.TrimPrefix(importPath, modulePath+"/")
	if !strings.HasPrefix(name, "internal/") {
		return "outer"
	}
	name = strings.TrimPrefix(name, "internal/")
	root := strings.SplitN(name, "/", 2)[0]
	switch root {
	case "domain", "features", "transport":
		return root
	case "config", "plugins", "ports", "transcription":
		return "support"
	default:
		return "outer"
	}
}

// allowedLayerDependency is the maintained package-layer dependency matrix.
// Composition and legacy layers remain unconstrained here while they are
// migrated; domain, feature, and transport boundaries fail closed.
func allowedLayerDependency(from, to string) bool {
	switch from {
	case "domain":
		return to == "domain"
	case "features":
		return to == "domain" || to == "features"
	case "transport":
		return to == "domain" || to == "features" || to == "support" || to == "transport"
	default:
		return true
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
