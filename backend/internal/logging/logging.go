package logging

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type ArchiveWriter interface {
	Save(objectKey string, data []byte) error
}

func recordJSONL(record Record) ([]byte, error) {
	line, err := json.Marshal(record)
	if err != nil {
		return nil, err
	}
	return append(line, '\n'), nil
}

type Record struct {
	ID           int64     `json:"id"`
	Timestamp    time.Time `json:"timestamp"`
	Level        string    `json:"level"`
	LevelNo      int       `json:"levelNo"`
	Logger       string    `json:"logger"`
	Message      string    `json:"message"`
	Module       string    `json:"module"`
	FunctionName string    `json:"functionName"`
	LineNo       int       `json:"lineNo"`
	Exception    *string   `json:"exception"`
}

type Buffer struct {
	mu      sync.RWMutex
	limit   int
	records []Record
	nextID  atomic.Int64
	logFile *os.File
	archive *archiveSink
}

// NewBufferWithArchive keeps recent records in memory and writes immutable JSONL batches asynchronously.
func NewBufferWithArchive(limit int, writer ArchiveWriter) *Buffer {
	if limit <= 0 {
		limit = 2000
	}
	return &Buffer{limit: limit, records: make([]Record, 0, limit), archive: newArchiveSink(writer)}
}

func NewBuffer(limit int, logPath string) (*Buffer, error) {
	if limit <= 0 {
		limit = 2000
	}
	if err := os.MkdirAll(filepath.Dir(logPath), 0o755); err != nil {
		return nil, err
	}
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}
	return &Buffer{
		limit:   limit,
		records: make([]Record, 0, limit),
		logFile: logFile,
	}, nil
}

func (b *Buffer) Close() error {
	if b.archive != nil {
		b.archive.Close()
	}
	if b.logFile == nil {
		return nil
	}
	return b.logFile.Close()
}

func (b *Buffer) Records() []Record {
	b.mu.RLock()
	defer b.mu.RUnlock()
	out := make([]Record, len(b.records))
	copy(out, b.records)
	return out
}

func (b *Buffer) Clear() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.records = b.records[:0]
}

func (b *Buffer) append(record Record) {
	_, _ = fmt.Fprintf(os.Stdout, "%s %-7s [%s] %s\n", record.Timestamp.Format(time.RFC3339), record.Level, record.Logger, record.Message)
	if b.logFile != nil {
		if line, err := recordJSONL(record); err == nil {
			_, _ = b.logFile.Write(line)
		}
	}
	if b.archive != nil {
		b.archive.Enqueue(record)
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.records) >= b.limit {
		copy(b.records, b.records[1:])
		b.records[len(b.records)-1] = record
		return
	}
	b.records = append(b.records, record)
}

type Logger struct {
	buffer *Buffer
}

func NewLogger(buffer *Buffer) *Logger {
	return &Logger{buffer: buffer}
}

func (l *Logger) Debugf(loggerName, format string, args ...any) {
	l.log("DEBUG", 10, loggerName, nil, format, args...)
}

func (l *Logger) Infof(loggerName, format string, args ...any) {
	l.log("INFO", 20, loggerName, nil, format, args...)
}

func (l *Logger) Warnf(loggerName, format string, args ...any) {
	l.log("WARNING", 30, loggerName, nil, format, args...)
}

func (l *Logger) Errorf(loggerName, format string, args ...any) {
	l.log("ERROR", 40, loggerName, nil, format, args...)
}

func (l *Logger) Exceptionf(loggerName string, err error, format string, args ...any) {
	var exception *string
	if err != nil {
		text := err.Error()
		exception = &text
	}
	l.log("ERROR", 40, loggerName, exception, format, args...)
}

func (l *Logger) log(level string, levelNo int, loggerName string, exception *string, format string, args ...any) {
	if l == nil || l.buffer == nil {
		return
	}

	message := fmt.Sprintf(format, args...)
	record := Record{
		ID:        l.buffer.nextID.Add(1),
		Timestamp: time.Now().UTC(),
		Level:     level,
		LevelNo:   levelNo,
		Logger:    loggerName,
		Message:   message,
	}

	if pc, file, line, ok := runtime.Caller(2); ok {
		record.Module = trimExt(filepath.Base(file))
		record.LineNo = line
		if fn := runtime.FuncForPC(pc); fn != nil {
			record.FunctionName = filepath.Base(fn.Name())
		}
	}
	record.Exception = exception

	line := fmt.Sprintf(
		"%s %-7s [%s] %s\n",
		record.Timestamp.Format(time.RFC3339),
		record.Level,
		record.Logger,
		record.Message,
	)
	if l.buffer.logFile != nil {
		_, _ = l.buffer.logFile.WriteString(line)
	}
	l.buffer.append(record)
}

func trimExt(name string) string {
	if index := strings.LastIndexByte(name, '.'); index >= 0 {
		return name[:index]
	}
	return name
}
