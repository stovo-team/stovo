package http

import (
	"encoding/json"
	stdhttp "net/http"
	"slices"
	"strconv"
	"strings"
	"time"
)

// AdminLogRecord is the transport representation returned by the stable
// administration log endpoint. It intentionally contains no logging adapter
// types so the HTTP boundary can be composed with any log source.
type AdminLogRecord struct {
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

type adminLogsResponse struct {
	Records    []AdminLogRecord `json:"records"`
	Total      int              `json:"total"`
	BufferSize int              `json:"bufferSize"`
	Limit      int              `json:"limit"`
}

// AdminLogsDependencies contains the narrow outer concerns needed by the log
// endpoint. Authorize returns zero when access is permitted, otherwise the
// HTTP status to return (401 or 403).
type AdminLogsDependencies struct {
	Authorize func(*stdhttp.Request) int
	Records   func() []AdminLogRecord
}

// NewAdminLogsHandler maps the administration log query contract to a log
// source. Authentication policy and log storage stay outside this transport.
func NewAdminLogsHandler(deps AdminLogsDependencies) stdhttp.Handler {
	return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		if status := deps.Authorize(r); status != 0 {
			message := "Admin access required"
			if status == stdhttp.StatusUnauthorized {
				message = "Authentication required"
			}
			writeAdminLogsJSON(w, status, map[string]string{"detail": message})
			return
		}

		limit := 200
		if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
			value, err := strconv.Atoi(raw)
			if err != nil || value < 1 || value > 1000 {
				writeAdminLogsJSON(w, stdhttp.StatusUnprocessableEntity, map[string]string{"detail": "Invalid limit"})
				return
			}
			limit = value
		}
		levelFilter := strings.TrimSpace(strings.ToUpper(r.URL.Query().Get("level")))
		loggerFilter := strings.TrimSpace(r.URL.Query().Get("logger"))
		searchFilter := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("search")))
		if levelFilter != "" && !slices.Contains([]string{"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}, levelFilter) {
			writeAdminLogsJSON(w, stdhttp.StatusUnprocessableEntity, map[string]string{"detail": "Invalid level"})
			return
		}
		if len(loggerFilter) > 200 {
			writeAdminLogsJSON(w, stdhttp.StatusUnprocessableEntity, map[string]string{"detail": "Invalid logger filter"})
			return
		}
		if len(searchFilter) > 500 {
			writeAdminLogsJSON(w, stdhttp.StatusUnprocessableEntity, map[string]string{"detail": "Invalid search filter"})
			return
		}

		records := deps.Records()
		filtered := make([]AdminLogRecord, 0, len(records))
		for _, record := range records {
			if levelFilter != "" && record.Level != levelFilter {
				continue
			}
			if loggerFilter != "" && !strings.Contains(record.Logger, loggerFilter) {
				continue
			}
			if searchFilter != "" && !strings.Contains(strings.ToLower(record.Message), searchFilter) {
				continue
			}
			filtered = append(filtered, record)
		}
		if len(filtered) > limit {
			filtered = filtered[len(filtered)-limit:]
		}
		writeAdminLogsJSON(w, stdhttp.StatusOK, adminLogsResponse{Records: filtered, Total: len(filtered), BufferSize: len(records), Limit: limit})
	})
}

func writeAdminLogsJSON(w stdhttp.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
