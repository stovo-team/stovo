package testshard

import (
	"bufio"
	"bytes"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

type coverageBlock struct {
	statements uint64
	count      uint64
}

// MergeCoverage combines Go atomic coverage profiles. Blocks present in only
// one profile are retained; counts for the same source block are added.
func MergeCoverage(profiles ...[]byte) ([]byte, error) {
	if len(profiles) == 0 {
		return nil, fmt.Errorf("at least one coverage profile is required")
	}

	var mode string
	blocks := make(map[string]coverageBlock)
	for profileIndex, raw := range profiles {
		profileMode, profileBlocks, err := parseCoverageProfile(raw)
		if err != nil {
			return nil, fmt.Errorf("coverage profile %d: %w", profileIndex+1, err)
		}
		if mode == "" {
			mode = profileMode
		} else if profileMode != mode {
			return nil, fmt.Errorf("coverage mode mismatch: %q and %q", mode, profileMode)
		}
		if mode != "atomic" {
			return nil, fmt.Errorf("coverage mode must be atomic, got %q", mode)
		}
		for key, block := range profileBlocks {
			previous, exists := blocks[key]
			if !exists {
				blocks[key] = block
				continue
			}
			if previous.statements != block.statements {
				return nil, fmt.Errorf("statement count mismatch for coverage block %q: %d and %d", key, previous.statements, block.statements)
			}
			if math.MaxUint64-previous.count < block.count {
				return nil, fmt.Errorf("coverage count overflow for block %q", key)
			}
			previous.count += block.count
			blocks[key] = previous
		}
	}

	keys := make([]string, 0, len(blocks))
	for key := range blocks {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	var merged bytes.Buffer
	fmt.Fprintf(&merged, "mode: %s\n", mode)
	for _, key := range keys {
		block := blocks[key]
		fmt.Fprintf(&merged, "%s %d %d\n", key, block.statements, block.count)
	}
	return merged.Bytes(), nil
}

func parseCoverageProfile(raw []byte) (string, map[string]coverageBlock, error) {
	scanner := bufio.NewScanner(bytes.NewReader(raw))
	if !scanner.Scan() {
		return "", nil, fmt.Errorf("empty coverage profile")
	}
	header := strings.Fields(scanner.Text())
	if len(header) != 2 || header[0] != "mode:" || header[1] == "" {
		return "", nil, fmt.Errorf("invalid coverage mode header %q", scanner.Text())
	}
	mode := header[1]
	blocks := make(map[string]coverageBlock)
	lineNumber := 1
	for scanner.Scan() {
		lineNumber++
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) != 3 || !strings.Contains(fields[0], ":") {
			return "", nil, fmt.Errorf("invalid coverage block at line %d", lineNumber)
		}
		statements, err := strconv.ParseUint(fields[1], 10, 64)
		if err != nil {
			return "", nil, fmt.Errorf("invalid statement count at line %d: %w", lineNumber, err)
		}
		count, err := strconv.ParseUint(fields[2], 10, 64)
		if err != nil {
			return "", nil, fmt.Errorf("invalid execution count at line %d: %w", lineNumber, err)
		}
		if _, exists := blocks[fields[0]]; exists {
			return "", nil, fmt.Errorf("duplicate coverage block %q in profile", fields[0])
		}
		blocks[fields[0]] = coverageBlock{statements: statements, count: count}
	}
	if err := scanner.Err(); err != nil {
		return "", nil, fmt.Errorf("read coverage profile: %w", err)
	}
	return mode, blocks, nil
}
