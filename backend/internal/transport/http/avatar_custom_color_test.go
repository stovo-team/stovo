package http

import "testing"

func TestAvatarCustomColorsAndExpandedSymbols(t *testing.T) {
	for _, color := range []string{"#8c6b92", "#ABCDEF", "purple"} {
		if !validAvatarColor(&color) {
			t.Errorf("rejected safe color %q", color)
		}
	}
	for _, color := range []string{"#123", "#gggggg", "url(example)", "#12345678"} {
		if validAvatarColor(&color) {
			t.Errorf("accepted invalid color %q", color)
		}
	}
	for _, symbol := range []string{"briefcase", "code", "image", "file-text", "video", "globe", "coffee", "rocket"} {
		if !validAvatarSymbol(&symbol) {
			t.Errorf("rejected built-in symbol %q", symbol)
		}
	}
}
