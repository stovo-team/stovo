package main

import (
	"strings"
	"testing"
)

func TestSelectPatternIncludesFunctionsRunByGoTest(t *testing.T) {
	pattern, err := selectPattern(strings.NewReader("TestAccount\nExampleAccount\nFuzzAccount\nBenchmarkAccount\nok package 0s\n"), 0, 1)
	if err != nil {
		t.Fatal(err)
	}
	want := "^(ExampleAccount|FuzzAccount|TestAccount)$"
	if pattern != want {
		t.Fatalf("pattern = %q, want %q", pattern, want)
	}
}

func TestSelectPatternReturnsNeverMatchForEmptyTestList(t *testing.T) {
	pattern, err := selectPattern(strings.NewReader("ok package 0s\n"), 0, 3)
	if err != nil {
		t.Fatal(err)
	}
	if pattern != "^$" {
		t.Fatalf("pattern = %q, want ^$", pattern)
	}
}
