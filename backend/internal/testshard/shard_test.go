package testshard

import (
	"reflect"
	"testing"
)

func TestSelectPartitionsRootTestsExactlyOnce(t *testing.T) {
	names := []string{"TestAlpha", "TestBeta", "TestGamma", "TestDelta", "TestEpsilon"}
	assigned := map[string]int{}
	for shard := 0; shard < 2; shard++ {
		got, err := Select(names, shard, 2); if err != nil { t.Fatal(err) }
		for _, name := range got { if previous, ok := assigned[name]; ok { t.Fatalf("%s assigned to %d and %d", name, previous, shard) }; assigned[name] = shard }
	}
	if len(assigned) != len(names) { t.Fatalf("assigned %d/%d names", len(assigned), len(names)) }
}

func TestSelectIsStableAndRejectsInvalidInput(t *testing.T) {
	a, err := Select([]string{"TestB", "TestA"}, 0, 2); if err != nil { t.Fatal(err) }
	b, err := Select([]string{"TestA", "TestB"}, 0, 2); if err != nil { t.Fatal(err) }
	if !reflect.DeepEqual(a, b) { t.Fatalf("unstable assignment %v != %v", a, b) }
	if _, err := Select([]string{"TestA"}, 2, 2); err == nil { t.Fatal("expected invalid shard error") }
}
