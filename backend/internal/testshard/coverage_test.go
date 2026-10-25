package testshard

import (
	"strings"
	"testing"
)

func TestMergeCoverageUnionsBlocksAndSumsCounts(t *testing.T) {
	merged, err := MergeCoverage(
		[]byte("mode: atomic\na.go:1.1,1.2 1 2\na.go:3.1,3.2 2 4\n"),
		[]byte("mode: atomic\na.go:1.1,1.2 1 5\nb.go:2.1,2.3 3 7\n"),
	)
	if err != nil {
		t.Fatal(err)
	}
	want := "mode: atomic\na.go:1.1,1.2 1 7\na.go:3.1,3.2 2 4\nb.go:2.1,2.3 3 7\n"
	if string(merged) != want {
		t.Fatalf("merged profile:\n%s\nwant:\n%s", merged, want)
	}
}

func TestMergeCoverageRejectsDifferentModes(t *testing.T) {
	_, err := MergeCoverage(
		[]byte("mode: atomic\na.go:1.1,1.2 1 2\n"),
		[]byte("mode: set\na.go:1.1,1.2 1 1\n"),
	)
	if err == nil || !strings.Contains(err.Error(), "mode") {
		t.Fatalf("error = %v, want mode mismatch", err)
	}
}

func TestMergeCoverageRejectsDifferentStatementCountsForSameBlock(t *testing.T) {
	_, err := MergeCoverage(
		[]byte("mode: atomic\na.go:1.1,1.2 1 2\n"),
		[]byte("mode: atomic\na.go:1.1,1.2 2 1\n"),
	)
	if err == nil || !strings.Contains(err.Error(), "statement count") {
		t.Fatalf("error = %v, want statement-count mismatch", err)
	}
}

func TestMergeCoverageRejectsMalformedProfiles(t *testing.T) {
	for _, profile := range [][]byte{
		nil,
		[]byte("a.go:1.1,1.2 1 2\n"),
		[]byte("mode: atomic\nnot a coverage block\n"),
	} {
		if _, err := MergeCoverage(profile); err == nil {
			t.Fatalf("MergeCoverage(%q) returned no error", profile)
		}
	}
}
