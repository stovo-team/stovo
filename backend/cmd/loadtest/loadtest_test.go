package main

import (
	"testing"
	"time"
)

func TestMetricRecorderCalculatesPercentilesCorrectly(t *testing.T) {
	r := NewMetricRecorder("test-metric")

	// Insert 100 samples: 1ms, 2ms, ... 100ms
	for i := 1; i <= 100; i++ {
		r.Record(time.Duration(i)*time.Millisecond, true)
	}
	r.Record(0, false) // 1 failure

	summary := r.Snapshot(time.Second)

	if summary.TotalOps != 101 {
		t.Fatalf("TotalOps = %d, want 101", summary.TotalOps)
	}
	if summary.SuccessOps != 100 {
		t.Fatalf("SuccessOps = %d, want 100", summary.SuccessOps)
	}
	if summary.FailedOps != 1 {
		t.Fatalf("FailedOps = %d, want 1", summary.FailedOps)
	}
	if summary.Min != 1*time.Millisecond {
		t.Fatalf("Min = %v, want 1ms", summary.Min)
	}
	if summary.Max != 100*time.Millisecond {
		t.Fatalf("Max = %v, want 100ms", summary.Max)
	}
	if summary.MedianP50 != 50*time.Millisecond {
		t.Fatalf("MedianP50 = %v, want 50ms", summary.MedianP50)
	}
	if summary.P90 != 90*time.Millisecond {
		t.Fatalf("P90 = %v, want 90ms", summary.P90)
	}
	if summary.P95 != 95*time.Millisecond {
		t.Fatalf("P95 = %v, want 95ms", summary.P95)
	}
	if summary.P99 != 99*time.Millisecond {
		t.Fatalf("P99 = %v, want 99ms", summary.P99)
	}
}

func TestFormatStatsTableDoesNotPanic(t *testing.T) {
	r := NewMetricRecorder("sample")
	r.Record(10*time.Millisecond, true)
	summary := r.Snapshot(time.Second)

	table := FormatStatsTable([]StatsSummary{summary}, time.Second)
	if len(table) == 0 {
		t.Fatal("expected non-empty table output")
	}
}
