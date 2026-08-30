package runtime

import "testing"

func TestShouldPromoteCallToSFU(t *testing.T) {
	for _, tc := range []struct {
		name                     string
		connected, limit         int
		alreadySFU, wantPromoted bool
	}{
		{"below limit", 2, 3, false, false},
		{"at limit", 3, 3, false, false},
		{"above limit", 4, 3, false, true},
		{"already sfu", 6, 3, true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := ShouldPromoteCallToSFU(tc.connected, tc.limit, tc.alreadySFU); got != tc.wantPromoted {
				t.Fatalf("ShouldPromoteCallToSFU() = %v, want %v", got, tc.wantPromoted)
			}
		})
	}
}
