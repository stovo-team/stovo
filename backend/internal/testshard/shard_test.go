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
		selected, err := Select(names, shardIndex, 3, nil, nil)
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
	first, err := Select([]string{"TestZeta", "TestAlpha", "TestBeta"}, 1, 3, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Select([]string{"TestBeta", "TestZeta", "TestAlpha"}, 1, 3, nil, nil)
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
	selected, err := Select(nil, 0, 3, nil, nil)
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
			if _, err := Select([]string{"TestAlpha"}, test.index, test.num, nil, nil); err == nil {
				t.Fatal("Select returned no error for invalid shard configuration")
			}
		})
	}
}

func TestSelectRejectsDuplicateNames(t *testing.T) {
	if _, err := Select([]string{"TestAlpha", "TestAlpha"}, 0, 3, nil, nil); err == nil {
		t.Fatal("Select returned no error for duplicate test names")
	}
}

func TestSelectBalancesDurationsAndAccountsForOtherWork(t *testing.T) {
	names := []string{"TestA", "TestB", "TestC", "TestD", "TestNew"}
	durations := map[string]float64{"TestA": 10, "TestB": 8, "TestC": 7, "TestD": 6}
	got := make([][]string, 3)
	for shard := range got {
		var err error
		got[shard], err = Select(names, shard, 3, durations, []float64{9, 0, 0})
		if err != nil {
			t.Fatal(err)
		}
	}
	want := [][]string{{"TestD"}, {"TestA", "TestNew"}, {"TestB", "TestC"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("assignment = %v, want %v", got, want)
	}
}

func TestSelectRejectsInvalidWeights(t *testing.T) {
	for _, tc := range []struct {
		name      string
		durations map[string]float64
		loads     []float64
	}{
		{"negative duration", map[string]float64{"TestA": -1}, nil},
		{"negative load", nil, []float64{-1, 0, 0}},
		{"wrong number of loads", nil, []float64{0}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := Select([]string{"TestA"}, 0, 3, tc.durations, tc.loads); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}
