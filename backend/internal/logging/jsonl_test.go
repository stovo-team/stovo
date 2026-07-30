package logging

import (
	"encoding/json"
	"testing"
	"time"
)

func TestRecordJSONLSerializesCompleteRecord(t *testing.T) {
	exception := "disk unavailable"
	record := Record{
		ID:        42,
		Timestamp: time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC),
		Level:     "ERROR",
		LevelNo:   40,
		Logger:    "storage",
		Message:   "upload failed",
		Module:    "file_handlers",
		LineNo:    63,
		Exception: &exception,
	}

	line, err := recordJSONL(record)
	if err != nil {
		t.Fatalf("recordJSONL: %v", err)
	}
	if line[len(line)-1] != '\n' {
		t.Fatal("JSONL record must end with a newline")
	}
	var decoded Record
	if err := json.Unmarshal(line, &decoded); err != nil {
		t.Fatalf("decode JSONL record: %v", err)
	}
	if decoded.ID != record.ID || decoded.Message != record.Message || decoded.Exception == nil || *decoded.Exception != exception {
		t.Fatalf("decoded record = %#v, want %#v", decoded, record)
	}
}
