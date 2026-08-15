package app

import (
	"reflect"
	"testing"
)

func TestUniqueAttachmentFileIDsPreservesDistinctAttachmentOrder(t *testing.T) {
	got := uniqueAttachmentFileIDs([]string{"photo-1", "photo-2", "photo-1", "document-1", "photo-2"})
	want := []string{"photo-1", "photo-2", "document-1"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("uniqueAttachmentFileIDs() = %v, want %v", got, want)
	}
}
