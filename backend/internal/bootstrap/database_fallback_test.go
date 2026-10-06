package bootstrap

import "testing"

func TestShouldAttemptLocalDatabaseFallback(t *testing.T) {
	tests := []struct {
		name, databaseURL string
		disable           bool
		want              bool
	}{
		{name: "configured external database retains legacy fallback", databaseURL: "postgres://db.example.test/app", want: true},
		{name: "pooler runtime never bypasses configured proxy", databaseURL: "postgres://pgbouncer/app", disable: true, want: false},
		{name: "no explicit database URL has no fallback candidates", want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldAttemptLocalDatabaseFallback(tt.databaseURL, tt.disable); got != tt.want {
				t.Fatalf("shouldAttemptLocalDatabaseFallback() = %t, want %t", got, tt.want)
			}
		})
	}
}
