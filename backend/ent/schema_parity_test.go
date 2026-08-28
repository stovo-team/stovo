package ent_test

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"testing"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/ent/migrate"
)

func TestEntTablesMatchSchemaFixture(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	fixturePath := filepath.Join(filepath.Dir(thisFile), "..", "testdata", "schema", "current.sql")
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	fixtureTables := tablesFromDump(string(raw))
	entTables := tablesFromEnt()

	sort.Strings(fixtureTables)
	sort.Strings(entTables)

	if len(fixtureTables) == 0 {
		t.Fatal("fixture contained no tables")
	}
	if strings.Join(fixtureTables, ",") != strings.Join(entTables, ",") {
		t.Fatalf("ent/fixture table drift\nfixture (%d): %v\nent (%d): %v",
			len(fixtureTables), fixtureTables, len(entTables), entTables)
	}
}

func tablesFromDump(sql string) []string {
	re := regexp.MustCompile(`(?i)CREATE TABLE (?:public\.)?([a-z0-9_]+)`)
	seen := map[string]struct{}{}
	var out []string
	for _, m := range re.FindAllStringSubmatch(sql, -1) {
		name := strings.ToLower(m[1])
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		out = append(out, name)
	}
	return out
}

func tablesFromEnt() []string {
	tables := migrate.Tables
	out := make([]string, 0, len(tables))
	for _, table := range tables {
		out = append(out, table.Name)
	}
	_ = ent.NewClient
	return out
}
