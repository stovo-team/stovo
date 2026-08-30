package http

import (
	stdhttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAdminLogsHandlerPreservesFilteringAndContractErrors(t *testing.T) {
	handler := NewAdminLogsHandler(AdminLogsDependencies{
		Authorize: func(*stdhttp.Request) int { return 0 },
		Records: func() []AdminLogRecord {
			return []AdminLogRecord{
				{ID: 1, Level: "INFO", Logger: "chat", Message: "created"},
				{ID: 2, Level: "ERROR", Logger: "files", Message: "upload failed"},
			}
		},
	})
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(stdhttp.MethodGet, "/api/admin/logs?level=ERROR&search=FAILED", nil))
	if recorder.Code != stdhttp.StatusOK || !strings.Contains(recorder.Body.String(), `"total":1`) || !strings.Contains(recorder.Body.String(), `"id":2`) {
		t.Fatalf("unexpected filtered response: status=%d body=%s", recorder.Code, recorder.Body.String())
	}

	recorder = httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(stdhttp.MethodGet, "/api/admin/logs?limit=0", nil))
	if recorder.Code != stdhttp.StatusUnprocessableEntity || !strings.Contains(recorder.Body.String(), "Invalid limit") {
		t.Fatalf("unexpected invalid-limit response: status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestAdminLogsHandlerPreservesAuthenticationResponses(t *testing.T) {
	for _, expected := range []struct {
		status int
		detail string
	}{{stdhttp.StatusUnauthorized, "Authentication required"}, {stdhttp.StatusForbidden, "Admin access required"}} {
		t.Run(expected.detail, func(t *testing.T) {
			handler := NewAdminLogsHandler(AdminLogsDependencies{Authorize: func(*stdhttp.Request) int { return expected.status }})
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(stdhttp.MethodGet, "/api/admin/logs", nil))
			if recorder.Code != expected.status || !strings.Contains(recorder.Body.String(), expected.detail) {
				t.Fatalf("unexpected response: status=%d body=%s", recorder.Code, recorder.Body.String())
			}
		})
	}
}
