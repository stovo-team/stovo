package app

import (
	"context"
	"fmt"
	"strings"

	"family-messenger/backend/internal/logging"

	"github.com/jackc/pgx/v5"
)

// pgxQueryTracer implements pgx.QueryTracer to log every SQL statement
// issued through the stdlib-adapter connection pool. It is wired in during
// server initialisation when LOG_LEVEL=debug is set.
type pgxQueryTracer struct {
	logger *logging.Logger
}

type traceQueryCtxKey struct{}

// TraceQueryStart is called before each query. It logs the SQL and args,
// then stores the normalised SQL in the context so TraceQueryEnd can
// correlate the log lines.
func (t *pgxQueryTracer) TraceQueryStart(
	ctx context.Context,
	_ *pgx.Conn,
	data pgx.TraceQueryStartData,
) context.Context {
	sql := normSQL(data.SQL)
	t.logger.Debugf("sql", "query sql=%s args=%s", sql, fmtArgs(data.Args))
	return context.WithValue(ctx, traceQueryCtxKey{}, sql)
}

// TraceQueryEnd logs query errors (if any). Successes are silent to avoid
// duplicate log lines.
func (t *pgxQueryTracer) TraceQueryEnd(
	ctx context.Context,
	_ *pgx.Conn,
	data pgx.TraceQueryEndData,
) {
	if data.Err != nil {
		sql, _ := ctx.Value(traceQueryCtxKey{}).(string)
		t.logger.Errorf("sql", "query error sql=%s err=%v", sql, data.Err)
	}
}

// normSQL collapses whitespace and truncates for readability in logs.
func normSQL(sql string) string {
	out := strings.Join(strings.Fields(sql), " ")
	if len(out) > 300 {
		return out[:300] + "…"
	}
	return out
}

// fmtArgs renders query arguments as a bracketed list.
func fmtArgs(args []any) string {
	if len(args) == 0 {
		return "[]"
	}
	parts := make([]string, len(args))
	for i, a := range args {
		parts[i] = fmt.Sprintf("%v", a)
	}
	return "[" + strings.Join(parts, ", ") + "]"
}
