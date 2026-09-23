package app

import "testing"

func TestDetectedMIMECompatible(t *testing.T) {
	tests := []struct {
		name     string
		expected string
		detected string
		want     bool
	}{
		{name: "markdown detected as plain text", expected: "text/markdown", detected: "text/plain; charset=utf-8", want: true},
		{name: "plain text with charset", expected: "text/plain", detected: "text/plain; charset=utf-8", want: true},
		{name: "markdown rejects PDF bytes", expected: "text/markdown", detected: "application/pdf", want: false},
		{name: "plain text rejects image bytes", expected: "text/plain", detected: "image/png", want: false},
		{name: "OOXML accepts ZIP bytes", expected: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", detected: "application/zip", want: true},
		{name: "unknown detection remains accepted", expected: "text/markdown", detected: "application/octet-stream", want: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := detectedMIMECompatible(test.expected, test.detected); got != test.want {
				t.Fatalf("detectedMIMECompatible(%q, %q) = %v, want %v", test.expected, test.detected, got, test.want)
			}
		})
	}
}
