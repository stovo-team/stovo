package ports

import "context"

// Cache stores short-lived application state such as rate limits and presence.
type Cache interface {
	Get(context.Context, string) (any, error)
	Set(context.Context, string, any, int) error
	Delete(context.Context, string) error
	Exists(context.Context, string) (bool, error)
	Increment(context.Context, string, int) (int64, error)
}
