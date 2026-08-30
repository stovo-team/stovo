package ports

import "context"

// HealthChecker is the narrow transport-facing readiness contract for an
// external dependency.
type HealthChecker interface{ Health(context.Context) error }
