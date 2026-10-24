package main

import (
	"bufio"
	"flag"
	"fmt"
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
	if err := flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("select accepts test names on stdin, not positional arguments")
	}

	var names []string
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		name := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(name, "Test") && !strings.Contains(name, "/") {
			names = append(names, name)
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read test names: %w", err)
	}
	selected, err := testshard.Select(names, *shardIndex, *shardCount)
	if err != nil {
		return err
	}
	if len(selected) == 0 {
		fmt.Println("^$")
		return nil
	}
	quoted := make([]string, len(selected))
	for index, name := range selected {
		quoted[index] = regexp.QuoteMeta(name)
	}
	fmt.Printf("^(%s)$\n", strings.Join(quoted, "|"))
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
