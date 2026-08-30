package ports

import (
	"errors"
	"strings"
)

// ErrNotFound is a common sentinel error for missing domain resources.
var ErrNotFound = errors.New("resource not found")

type notFoundError interface {
	IsNotFound() bool
}

// IsNotFound returns true if err indicates a missing resource.
func IsNotFound(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, ErrNotFound) {
		return true
	}
	var nf notFoundError
	if errors.As(err, &nf) {
		return nf.IsNotFound()
	}
	errStr := err.Error()
	return strings.HasPrefix(errStr, "ent: ") && strings.HasSuffix(errStr, " not found")
}
