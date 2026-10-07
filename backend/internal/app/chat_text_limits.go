package app

import "unicode/utf8"

func chatTitleTooLong(title string) bool {
	return utf8.RuneCountInString(title) > 255
}

func chatDescriptionTooLong(description string) bool {
	return utf8.RuneCountInString(description) > 120
}

func chatTitleValidationMessage(title string) string {
	if title == "" {
		return "title cannot be blank"
	}
	if chatTitleTooLong(title) {
		return "title cannot exceed 255 characters"
	}
	return ""
}
