package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

var mediaQualityPayloadFields = []string{
	"screenShareBitrateKbps",
	"cameraBitrateKbps",
	"groupCallScreenShareBitrateKbps",
	"groupCallCameraBitrateKbps",
	"dmCallScreenShareBitrateKbps",
	"dmCallCameraBitrateKbps",
}

func TestFamilyUpdateHandlerAcceptsMediaQualityBoundariesAndForwardsFields(t *testing.T) {
	for _, field := range mediaQualityPayloadFields {
		for _, value := range []int{1000, 20000} {
			t.Run(field+"/"+strconv.Itoa(value), func(t *testing.T) {
				body, err := json.Marshal(map[string]int{field: value})
				if err != nil {
					t.Fatal(err)
				}
				var forwarded map[string]any
				handler := NewFamilyUpdateHandler(FamilyUpdateOperations{
					IsAdmin: func(FamilyUpdateActor) bool { return true },
					IsOwner: func(FamilyUpdateActor) bool { return true },
					Update: func(_ context.Context, _ string, payload FamilyUpdateRequest) (any, error) {
						encoded, marshalErr := json.Marshal(payload)
						if marshalErr != nil {
							return nil, marshalErr
						}
						if unmarshalErr := json.Unmarshal(encoded, &forwarded); unmarshalErr != nil {
							return nil, unmarshalErr
						}
						return map[string]any{"ok": true}, nil
					},
				})
				recorder := httptest.NewRecorder()
				handler.Update(recorder, httptest.NewRequest(stdhttp.MethodPatch, "/api/family", strings.NewReader(string(body))), FamilyUpdateActor{FamilyID: "family-1", Role: "owner"})
				if recorder.Code != stdhttp.StatusOK {
					t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
				}
				if got, ok := forwarded[field].(float64); !ok || int(got) != value {
					t.Fatalf("forwarded %s = %v, want %d", field, forwarded[field], value)
				}
			})
		}
	}
}

func TestFamilyUpdateHandlerRejectsOutOfRangeMediaQualityValues(t *testing.T) {
	for _, field := range mediaQualityPayloadFields {
		for _, value := range []int{0, 999, 20001} {
			t.Run(field+"/invalid", func(t *testing.T) {
				body, err := json.Marshal(map[string]int{field: value})
				if err != nil {
					t.Fatal(err)
				}
				called := false
				handler := NewFamilyUpdateHandler(FamilyUpdateOperations{
					IsAdmin: func(FamilyUpdateActor) bool { return true },
					IsOwner: func(FamilyUpdateActor) bool { return true },
					Update: func(context.Context, string, FamilyUpdateRequest) (any, error) {
						called = true
						return nil, nil
					},
				})
				recorder := httptest.NewRecorder()
				handler.Update(recorder, httptest.NewRequest(stdhttp.MethodPatch, "/api/family", strings.NewReader(string(body))), FamilyUpdateActor{FamilyID: "family-1", Role: "owner"})
				if recorder.Code != stdhttp.StatusUnprocessableEntity {
					t.Fatalf("status = %d, body = %s; want %d", recorder.Code, recorder.Body.String(), stdhttp.StatusUnprocessableEntity)
				}
				if called {
					t.Fatal("update callback was called for an invalid bitrate")
				}
			})
		}
	}
}

func TestFamilyUpdateHandlerRequiresOwnerForMediaQualitySettings(t *testing.T) {
	for _, field := range mediaQualityPayloadFields {
		t.Run(field, func(t *testing.T) {
			body, err := json.Marshal(map[string]int{field: 5000})
			if err != nil {
				t.Fatal(err)
			}
			called := false
			handler := NewFamilyUpdateHandler(FamilyUpdateOperations{
				IsAdmin: func(FamilyUpdateActor) bool { return true },
				IsOwner: func(FamilyUpdateActor) bool { return false },
				Update: func(context.Context, string, FamilyUpdateRequest) (any, error) {
					called = true
					return nil, nil
				},
			})
			recorder := httptest.NewRecorder()
			handler.Update(recorder, httptest.NewRequest(stdhttp.MethodPatch, "/api/family", strings.NewReader(string(body))), FamilyUpdateActor{FamilyID: "family-1", Role: "admin"})
			if recorder.Code != stdhttp.StatusForbidden {
				t.Fatalf("status = %d, body = %s; want %d", recorder.Code, recorder.Body.String(), stdhttp.StatusForbidden)
			}
			if called {
				t.Fatal("update callback was called for a non-owner")
			}
		})
	}
}

func TestFamilyUpdateHandlerRejectsMalformedMediaQualityRequest(t *testing.T) {
	called := false
	handler := NewFamilyUpdateHandler(FamilyUpdateOperations{
		IsAdmin: func(FamilyUpdateActor) bool { return true },
		IsOwner: func(FamilyUpdateActor) bool { return true },
		Update: func(context.Context, string, FamilyUpdateRequest) (any, error) {
			called = true
			return nil, nil
		},
	})
	recorder := httptest.NewRecorder()
	handler.Update(recorder, httptest.NewRequest(stdhttp.MethodPatch, "/api/family", strings.NewReader(`{"cameraBitrateKbps":`)), FamilyUpdateActor{FamilyID: "family-1", Role: "owner"})
	if recorder.Code != stdhttp.StatusUnprocessableEntity {
		t.Fatalf("status = %d, body = %s; want %d", recorder.Code, recorder.Body.String(), stdhttp.StatusUnprocessableEntity)
	}
	if called {
		t.Fatal("update callback was called for malformed JSON")
	}
}
