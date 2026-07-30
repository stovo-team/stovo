package app

import "testing"

func TestAllowedMimeAcceptsParameterizedBrowserAudio(t *testing.T) {
	if !allowedMime("audio/webm;codecs=opus") {
		t.Fatal("parameterized WebM audio MIME type should be accepted")
	}
}
