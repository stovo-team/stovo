package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"

	"stovo-messenger/backend/internal/testshard"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("usage: test-shard <select|merge> [options]")
	}
	switch args[0] {
	case "select":
		return selectTests(args[1:])
	case "merge":
		return mergeCoverage(args[1:])
	default:
		return fmt.Errorf("unknown command %q; expected select or merge", args[0])
	}
}

func selectTests(args []string) error {
	flags := flag.NewFlagSet("select", flag.ContinueOnError)
	shardIndex := flags.Int("shard", -1, "zero-based shard index")
	shardCount := flags.Int("shards", 0, "total shard count")
	timingsPath := flags.String("timings", "", "JSON file with test durations in seconds")
	shardZeroLoad := flags.Float64("shard-zero-load", 0, "estimated additional seconds on shard zero")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("select accepts test names on stdin, not positional arguments")
	}

	var durations map[string]float64
	if *timingsPath != "" {
		data, err := os.ReadFile(*timingsPath)
		if err != nil {
			return fmt.Errorf("read timings: %w", err)
		}
		if err := json.Unmarshal(data, &durations); err != nil {
			return fmt.Errorf("parse timings: %w", err)
		}
		if durations == nil {
			return fmt.Errorf("timings must be a JSON object")
		}
	}
	loads := make([]float64, 0)
	if *shardCount > 0 {
		loads = make([]float64, *shardCount)
		loads[0] = *shardZeroLoad
	}
	pattern, err := selectPatternWithTimings(os.Stdin, *shardIndex, *shardCount, durations, loads)
	if err != nil {
		return err
	}
	fmt.Println(pattern)
	return nil
}

func mergeCoverage(args []string) error {
	flags := flag.NewFlagSet("merge", flag.ContinueOnError)
	outputPath := flags.String("output", "coverage.out", "merged coverage profile path")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() == 0 {
		return fmt.Errorf("merge requires at least one coverage profile")
	}
	profiles := make([][]byte, 0, flags.NArg())
	for _, path := range flags.Args() {
		profile, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read coverage profile %s: %w", path, err)
		}
		profiles = append(profiles, profile)
	}
	merged, err := testshard.MergeCoverage(profiles...)
	if err != nil {
		return err
	}
	if err := os.WriteFile(*outputPath, merged, 0o644); err != nil {
		return fmt.Errorf("write merged coverage profile %s: %w", *outputPath, err)
	}
	return nil
}

func selectPattern(input io.Reader, shardIndex, shardCount int) (string, error) {
	return selectPatternWithTimings(input, shardIndex, shardCount, nil, nil)
}

func selectPatternWithTimings(input io.Reader, shardIndex, shardCount int, durations map[string]float64, loads []float64) (string, error) {
	var names []string
	scanner := bufio.NewScanner(input)
	for scanner.Scan() {
		name := strings.TrimSpace(scanner.Text())
		isTestFunction := strings.HasPrefix(name, "Test") || strings.HasPrefix(name, "Example") || strings.HasPrefix(name, "Fuzz")
		if isTestFunction && !strings.Contains(name, "/") {
			names = append(names, name)
		}
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("read test names: %w", err)
	}
	selected, err := testshard.Select(names, shardIndex, shardCount, durations, loads)
	if err != nil {
		return "", err
	}
	if len(selected) == 0 {
		return "^$", nil
	}
	quoted := make([]string, len(selected))
	for index, name := range selected {
		quoted[index] = regexp.QuoteMeta(name)
	}
	return "^(" + strings.Join(quoted, "|") + ")$", nil
}
