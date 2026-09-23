package app

import "testing"

func TestDetectedMIMECompatibleForMarkdown(t *testing.T) {
	if !detectedMIMECompatible("text/markdown", "text/plain; charset=utf-8") {
		t.Fatal("Markdown text was rejected by content validation")
	}
	if detectedMIMECompatible("text/markdown", "image/png") {
		t.Fatal("non-text content accepted as Markdown")
	}
}
