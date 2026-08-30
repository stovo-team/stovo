package runtime

import "io"

// CloseFunc adapts a close callback to io.Closer. It is useful at runtime
// boundaries where a dependency exposes shutdown without an error result.
type CloseFunc func() error

func (f CloseFunc) Close() error {
	return f()
}

// ShutdownDependencies contains the ordered runtime resources that must be
// released when the process stops. The order deliberately drains consumers
// before their backing connections are closed.
//
// All closers except Database are best-effort, matching the server's existing
// shutdown behavior. Database's error remains the shutdown result.
type ShutdownDependencies struct {
	CancelRealtime func()
	WaitRealtime   func()
	Sockets        io.Closer
	Redis          io.Closer
	JobsRedis      io.Closer
	LogBuffer      io.Closer
	Persistence    io.Closer
	Database       io.Closer
}

// Shutdown releases runtime resources in their established order.
func Shutdown(deps ShutdownDependencies) error {
	if deps.CancelRealtime != nil {
		deps.CancelRealtime()
	}
	if deps.WaitRealtime != nil {
		deps.WaitRealtime()
	}
	closeIgnoringError(deps.Sockets)
	closeIgnoringError(deps.Redis)
	closeIgnoringError(deps.JobsRedis)
	closeIgnoringError(deps.LogBuffer)
	closeIgnoringError(deps.Persistence)
	if deps.Database == nil {
		return nil
	}
	return deps.Database.Close()
}

func closeIgnoringError(closer io.Closer) {
	if closer != nil {
		_ = closer.Close()
	}
}
