package internal_test

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestArchitectureLayerBoundaries enforces Clean Architecture boundary rules:
// domain, ports, and features must never import adapters, repository, transport, or bootstrap.
func TestArchitectureLayerBoundaries(t *testing.T) {
	forbiddenTargets := map[string][]string{
		"domain":   {"adapters", "repository", "transport", "bootstrap", "features", "ports"},
		"ports":    {"adapters", "repository", "transport", "bootstrap"},
		"features": {"adapters", "repository", "transport", "bootstrap"},
	}

	internalDir := "."
	fset := token.NewFileSet()

	err := filepath.Walk(internalDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() || !strings.HasSuffix(path, ".go") {
			return nil
		}

		relPath, err := filepath.Rel(internalDir, path)
		if err != nil {
			return err
		}

		parts := strings.Split(filepath.ToSlash(relPath), "/")
		if len(parts) < 2 {
			return nil
		}
		layer := parts[0]
		forbidden, ok := forbiddenTargets[layer]
		if !ok {
			return nil
		}

		node, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
		if err != nil {
			t.Errorf("failed to parse imports for %s: %v", path, err)
			return nil
		}

		for _, imp := range node.Imports {
			importPath := strings.Trim(imp.Path.Value, `"`)
			for _, target := range forbidden {
				targetPrefix := "stovo-messenger/backend/internal/" + target
				if importPath == targetPrefix || strings.HasPrefix(importPath, targetPrefix+"/") {
					t.Errorf("architecture boundary violation in %s: layer '%s' must not import '%s' (%s)",
						path, layer, target, importPath)
				}
			}
		}
		return nil
	})

	if err != nil {
		t.Fatalf("failed to walk internal directory: %v", err)
	}
}
