package testshard

import (
	"fmt"
	"hash/fnv"
	"sort"
)

// Select returns deterministic root-test assignments for a shard.
func Select(names []string, shardIndex, shardCount int) ([]string, error) {
	if shardCount < 1 { return nil, fmt.Errorf("shard count must be positive, got %d", shardCount) }
	if shardIndex < 0 || shardIndex >= shardCount { return nil, fmt.Errorf("shard index %d is outside [0, %d)", shardIndex, shardCount) }
	seen := make(map[string]struct{}, len(names))
	selected := make([]string, 0, len(names)/shardCount+1)
	for _, name := range names {
		if name == "" { return nil, fmt.Errorf("test name must not be empty") }
		if _, exists := seen[name]; exists { return nil, fmt.Errorf("duplicate test name %q", name) }
		seen[name] = struct{}{}
		hash := fnv.New64a(); _, _ = hash.Write([]byte(name))
		if int(hash.Sum64()%uint64(shardCount)) == shardIndex { selected = append(selected, name) }
	}
	sort.Strings(selected)
	return selected, nil
}
