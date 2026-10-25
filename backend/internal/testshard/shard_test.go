package testshard

import (
	"reflect"
	"sort"
	"testing"
)

func TestSelectAssignsEveryNameToExactlyOneShard(t *testing.T) {
	names := []string{"TestAlpha", "TestBeta", "TestGamma", "TestDelta", "TestEpsilon", "TestZeta"}
	assigned := make(map[string]int)
	for shardIndex := 0; shardIndex < 3; shardIndex++ {
		selected, err := Select(names, shardIndex, 3)
		if err != nil {
			t.Fatalf("Select shard %d: %v", shardIndex, err)
		}
		for _, name := range selected {
			if previous, exists := assigned[name]; exists {
				t.Fatalf("test %q assigned to shards %d and %d", name, previous, shardIndex)
			}
			assigned[name] = shardIndex
		}
	}
	if len(assigned) != len(names) {
		t.Fatalf("assigned %d tests, want all %d", len(assigned), len(names))
	}
	for _, name := range names {
		if _, exists := assigned[name]; !exists {
			t.Errorf("test %q was not assigned", name)
		}
	}
}

func TestSelectIsStableAndSorted(t *testing.T) {
	first, err := Select([]string{"TestZeta", "TestAlpha", "TestBeta"}, 1, 3)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Select([]string{"TestBeta", "TestZeta", "TestAlpha"}, 1, 3)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("assignment changed with input order: %v vs %v", first, second)
	}
	if !sort.StringsAreSorted(first) {
		t.Fatalf("selected names are not sorted: %v", first)
	}
}

func TestSelectReturnsEmptyForNoNames(t *testing.T) {
	selected, err := Select(nil, 0, 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(selected) != 0 {
		t.Fatalf("selected = %v, want no tests", selected)
	}
}

func TestSelectRejectsInvalidShardConfiguration(t *testing.T) {
	for _, test := range []struct {
		name       string
		index, num int
	}{
		{name: "zero shards", index: 0, num: 0},
		{name: "negative shards", index: 0, num: -1},
		{name: "negative index", index: -1, num: 3},
		{name: "index past end", index: 3, num: 3},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := Select([]string{"TestAlpha"}, test.index, test.num); err == nil {
				t.Fatal("Select returned no error for invalid shard configuration")
			}
		})
	}
}

func TestSelectRejectsDuplicateNames(t *testing.T) {
	if _, err := Select([]string{"TestAlpha", "TestAlpha"}, 0, 3); err == nil {
		t.Fatal("Select returned no error for duplicate test names")
	}
}
