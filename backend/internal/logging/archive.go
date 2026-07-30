package logging

import (
	"bytes"
	"fmt"
	"time"
)

const archiveFlushInterval = 5 * time.Second
const archiveBatchSize = 100

type archiveSink struct {
	writer  ArchiveWriter
	records chan Record
	done    chan struct{}
	closed  chan struct{}
	runID   string
	part    int
}

func newArchiveSink(writer ArchiveWriter) *archiveSink {
	if writer == nil {
		return nil
	}
	s := &archiveSink{writer: writer, records: make(chan Record, 1000), done: make(chan struct{}), closed: make(chan struct{}), runID: fmt.Sprintf("%d", time.Now().UTC().UnixNano())}
	go s.run()
	return s
}

func (s *archiveSink) Enqueue(record Record) {
	select {
	case s.records <- record:
	default:
	}
}
func (s *archiveSink) Close() { close(s.done); <-s.closed }
func (s *archiveSink) run() {
	defer close(s.closed)
	ticker := time.NewTicker(archiveFlushInterval)
	defer ticker.Stop()
	batch := make([]Record, 0, archiveBatchSize)
	flush := func() {
		if len(batch) == 0 {
			return
		}
		var data bytes.Buffer
		for _, record := range batch {
			line, err := recordJSONL(record)
			if err == nil {
				data.Write(line)
			}
		}
		if data.Len() > 0 {
			s.part++
			now := time.Now().UTC()
			key := fmt.Sprintf("logs/%04d/%02d/%02d/%02d/%s/part-%06d.jsonl", now.Year(), now.Month(), now.Day(), now.Hour(), s.runID, s.part)
			for attempt := 0; attempt < 3; attempt++ {
				if s.writer.Save(key, data.Bytes()) == nil {
					break
				}
				time.Sleep(time.Duration(attempt+1) * 100 * time.Millisecond)
			}
		}
		batch = batch[:0]
	}
	for {
		select {
		case record := <-s.records:
			batch = append(batch, record)
			if len(batch) >= archiveBatchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		case <-s.done:
			for {
				select {
				case record := <-s.records:
					batch = append(batch, record)
				default:
					flush()
					return
				}
			}
		}
	}
}
