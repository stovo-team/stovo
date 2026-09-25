package main

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
	"time"
)

// MetricRecorder safely collects latency samples and event counts across concurrent test workers.
type MetricRecorder struct {
	name    string
	mu      sync.Mutex
	samples []time.Duration
	success int64
	failure int64
}

func NewMetricRecorder(name string) *MetricRecorder {
	return &MetricRecorder{
		name:    name,
		samples: make([]time.Duration, 0, 1024),
	}
}

func (r *MetricRecorder) Record(d time.Duration, success bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if success {
		r.samples = append(r.samples, d)
		r.success++
	} else {
		r.failure++
	}
}

type StatsSummary struct {
	Name       string        `json:"name"`
	TotalOps   int64         `json:"totalOps"`
	SuccessOps int64         `json:"successOps"`
	FailedOps  int64         `json:"failedOps"`
	RatePerSec float64       `json:"ratePerSec"`
	Min        time.Duration `json:"min"`
	Mean       time.Duration `json:"mean"`
	MedianP50  time.Duration `json:"medianP50"`
	P90        time.Duration `json:"p90"`
	P95        time.Duration `json:"p95"`
	P99        time.Duration `json:"p99"`
	Max        time.Duration `json:"max"`
}

func (r *MetricRecorder) Snapshot(elapsed time.Duration) StatsSummary {
	r.mu.Lock()
	defer r.mu.Unlock()

	s := StatsSummary{
		Name:       r.name,
		TotalOps:   r.success + r.failure,
		SuccessOps: r.success,
		FailedOps:  r.failure,
	}

	if elapsed > 0 {
		s.RatePerSec = float64(s.TotalOps) / elapsed.Seconds()
	}

	n := len(r.samples)
	if n == 0 {
		return s
	}

	sorted := make([]time.Duration, n)
	copy(sorted, r.samples)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })

	s.Min = sorted[0]
	s.Max = sorted[n-1]

	var total time.Duration
	for _, d := range sorted {
		total += d
	}
	s.Mean = time.Duration(int64(total) / int64(n))

	percentile := func(p float64) time.Duration {
		idx := int(math.Ceil(float64(n)*(p/100.0))) - 1
		if idx < 0 {
			idx = 0
		}
		if idx >= n {
			idx = n - 1
		}
		return sorted[idx]
	}

	s.MedianP50 = percentile(50)
	s.P90 = percentile(90)
	s.P95 = percentile(95)
	s.P99 = percentile(99)

	return s
}

// FormatStatsTable prints an aligned, readable summary table for the terminal.
func FormatStatsTable(summaries []StatsSummary, duration time.Duration) string {
	var sb strings.Builder
	sb.WriteString("\n" + strings.Repeat("=", 86) + "\n")
	fmt.Fprintf(&sb, " LOAD TEST RESULTS (Duration: %v)\n", duration.Round(time.Millisecond))
	sb.WriteString(strings.Repeat("-", 86) + "\n")
	fmt.Fprintf(&sb, "%-22s %7s %7s %8s %8s %8s %8s %8s\n",
		"METRIC", "SUCCESS", "FAIL", "P50", "P90", "P95", "P99", "MAX")
	sb.WriteString(strings.Repeat("-", 86) + "\n")

	for _, s := range summaries {
		if s.TotalOps == 0 {
			fmt.Fprintf(&sb, "%-22s %7d %7d %8s %8s %8s %8s %8s\n",
				s.Name, s.SuccessOps, s.FailedOps, "-", "-", "-", "-", "-")
			continue
		}
		fmt.Fprintf(&sb, "%-22s %7d %7d %8s %8s %8s %8s %8s\n",
			s.Name,
			s.SuccessOps,
			s.FailedOps,
			formatDuration(s.MedianP50),
			formatDuration(s.P90),
			formatDuration(s.P95),
			formatDuration(s.P99),
			formatDuration(s.Max),
		)
	}
	sb.WriteString(strings.Repeat("=", 86) + "\n\n")
	return sb.String()
}

func formatDuration(d time.Duration) string {
	if d < time.Millisecond {
		return fmt.Sprintf("%.1fµs", float64(d.Nanoseconds())/1000.0)
	}
	if d < time.Second {
		return fmt.Sprintf("%.1fms", float64(d.Nanoseconds())/1e6)
	}
	return fmt.Sprintf("%.2fs", d.Seconds())
}
