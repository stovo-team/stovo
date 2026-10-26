package http

import "encoding/hex"

func validAvatarMode(value *string) bool {
	return value == nil || *value == "" || *value == "photo" || *value == "symbol"
}

func validAvatarSymbol(value *string) bool {
	if value == nil || *value == "" {
		return true
	}
	switch *value {
	case "initials", "user-round", "users", "home", "archive", "audio-lines", "megaphone", "folder", "heart", "star", "music", "book-open", "camera", "shield", "sparkles", "bell", "image", "file-text", "video", "briefcase", "code", "globe", "coffee", "rocket":
		return true
	default:
		return false
	}
}

func validAvatarColor(value *string) bool {
	if value == nil || *value == "" {
		return true
	}
	if len(*value) == 7 && (*value)[0] == '#' {
		_, err := hex.DecodeString((*value)[1:])
		return err == nil
	}
	switch *value {
	case "red", "orange", "green", "blue", "purple", "pink", "teal", "sky":
		return true
	default:
		return false
	}
}

func avatarValidationDetail(mode, symbol, color *string) string {
	if !validAvatarMode(mode) {
		return "Invalid avatar mode"
	}
	if !validAvatarSymbol(symbol) {
		return "Invalid avatar symbol"
	}
	if !validAvatarColor(color) {
		return "Invalid avatar color"
	}
	return ""
}
