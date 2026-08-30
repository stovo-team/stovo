package runtime

import (
	"context"
	"errors"
	"strings"
	"time"
)

// FileValidationRunner encapsulates worker configuration for file validation streaming.
type FileValidationRunner struct {
	StreamName  string
	GroupName   string
	ConsumerID  string
	BlockTime   time.Duration
	BatchSize   int
	JobConsumer JobConsumer
	ProcessJob  func(ctx context.Context, eventID, payload string) error
	Report      func(err error)
}

// RunFileValidationWorker supervises the file validation worker stream.
func RunFileValidationWorker(ctx context.Context, runner FileValidationRunner) {
	if runner.JobConsumer == nil || runner.ProcessJob == nil {
		return
	}
	if runner.StreamName == "" {
		runner.StreamName = "stovo:jobs"
	}
	if runner.GroupName == "" {
		runner.GroupName = "file-validation"
	}
	if runner.BatchSize <= 0 {
		runner.BatchSize = 8
	}
	if runner.BlockTime <= 0 {
		runner.BlockTime = 5 * time.Second
	}

	if err := runner.JobConsumer.EnsureGroup(ctx, runner.StreamName, runner.GroupName, "0"); err != nil {
		if runner.Report != nil {
			runner.Report(err)
		}
		return
	}

	consumeBatch := func(cursor string) error {
		streams, err := runner.JobConsumer.ReadGroup(ctx, runner.StreamName, runner.GroupName, runner.ConsumerID, cursor, runner.BatchSize, runner.BlockTime)
		if err != nil {
			return err
		}
		for _, message := range streams {
			if message.Topic != "file.validate" {
				if err := runner.JobConsumer.Ack(ctx, runner.StreamName, runner.GroupName, message.ID); err != nil {
					return err
				}
				continue
			}
			if err := runner.ProcessJob(ctx, message.EventID, message.Payload); err != nil {
				return err
			}
			if err := runner.JobConsumer.Ack(ctx, runner.StreamName, runner.GroupName, message.ID); err != nil {
				return err
			}
		}
		return nil
	}

	for {
		if ctx.Err() != nil {
			return
		}
		if err := consumeBatch("0"); err != nil && ctx.Err() == nil && runner.Report != nil {
			runner.Report(err)
		}
		if err := consumeBatch(">"); err != nil && ctx.Err() == nil && !errors.Is(err, ErrNoJobs) && runner.Report != nil {
			runner.Report(err)
		}
	}
}

// Helper to determine consumer ID default name format
func DefaultFileValidationConsumerName(serverID string) string {
	consumer := strings.TrimSpace(serverID)
	if consumer != "" {
		return consumer
	}
	return "file-validator-default"
}
