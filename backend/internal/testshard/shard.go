package testshard

import (
	"fmt"
	"math"
	"sort"
)

// Select distributes names deterministically by their estimated durations. Unknown
// names receive a one-second estimate. initialLoads accounts for work outside
// the selected tests, such as other packages run by one shard.
func Select(names []string, shardIndex, shardCount int, durations map[string]float64, initialLoads []float64) ([]string, error) {
	if shardCount < 1 {
		return nil, fmt.Errorf("shard count must be positive, got %d", shardCount)
	}
	if shardIndex < 0 || shardIndex >= shardCount {
		return nil, fmt.Errorf("shard index %d is outside [0, %d)", shardIndex, shardCount)
	}
	if len(initialLoads) != 0 && len(initialLoads) != shardCount {
		return nil, fmt.Errorf("expected %d initial loads, got %d", shardCount, len(initialLoads))
	}
	loads := make([]float64, shardCount)
	copy(loads, initialLoads)
	for _, load := range loads {
		if load < 0 || math.IsNaN(load) || math.IsInf(load, 0) {
			return nil, fmt.Errorf("invalid initial load %v", load)
		}
	}
	seen := make(map[string]bool, len(names))
	type weightedTest struct {
		name    string
		seconds float64
	}
	tests := make([]weightedTest, 0, len(names))
	for _, name := range names {
		if name == "" {
			return nil, fmt.Errorf("test name must not be empty")
		}
		if seen[name] {
			return nil, fmt.Errorf("duplicate test name %q", name)
		}
		seen[name] = true
		seconds, ok := durations[name]
		if !ok {
			seconds = 1
		}
		if seconds < 0 || math.IsNaN(seconds) || math.IsInf(seconds, 0) {
			return nil, fmt.Errorf("invalid duration for %q: %v", name, seconds)
		}
		tests = append(tests, weightedTest{name, seconds})
	}
	sort.Slice(tests, func(i, j int) bool {
		if tests[i].seconds != tests[j].seconds {
			return tests[i].seconds > tests[j].seconds
		}
		return tests[i].name < tests[j].name
	})
	var selected []string
	for _, test := range tests {
		shard := 0
		for i := 1; i < shardCount; i++ {
			if loads[i] < loads[shard] {
				shard = i
			}
		}
		loads[shard] += test.seconds
		if shard == shardIndex {
			selected = append(selected, test.name)
		}
	}
	sort.Strings(selected)
	return selected, nil
}
