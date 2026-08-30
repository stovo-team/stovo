package http

import (
	"context"
	"errors"
	stdhttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFamilyReadHandlerWritesStableContract(t *testing.T) {
	handler := NewFamilyReadHandler(FamilyReadOperations{
		Load: func(context.Context, string) (Family, error) {
			return Family{ID: "family-1", Name: "Stovo", NavTabs: NavTabs{Chats: true}}, nil
		},
	})
	recorder := httptest.NewRecorder()
	handler.GetFamily(recorder, httptest.NewRequest(stdhttp.MethodGet, "/api/family", nil), "family-1")
	if recorder.Code != stdhttp.StatusOK || !strings.Contains(recorder.Body.String(), `"id":"family-1"`) || !strings.Contains(recorder.Body.String(), `"navTabs":{"chats":true`) {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestFamilyReadHandlerPreservesErrors(t *testing.T) {
	notFound := errors.New("missing")
	handler := NewFamilyReadHandler(FamilyReadOperations{
		Load:       func(context.Context, string) (Family, error) { return Family{}, notFound },
		IsNotFound: func(err error) bool { return errors.Is(err, notFound) },
	})
	recorder := httptest.NewRecorder()
	handler.GetFamily(recorder, httptest.NewRequest(stdhttp.MethodGet, "/api/family", nil), "missing")
	if recorder.Code != stdhttp.StatusNotFound || !strings.Contains(recorder.Body.String(), `"detail":"Family not found"`) {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
}
