package orchestrator

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestMasterLockMockWithoutDB(t *testing.T) {
	lock := NewMasterLock(nil)

	token1, release1, err := lock.Acquire(context.Background(), 1*time.Second)
	if err != nil {
		t.Fatalf("acquire token1 failed: %v", err)
	}
	defer release1()

	if token1 != 1 {
		t.Errorf("token1 = %d, want 1", token1)
	}
	if !lock.ValidateToken(token1) {
		t.Errorf("expected token1 to be valid")
	}

	token2, release2, err := lock.Acquire(context.Background(), 1*time.Second)
	if err != nil {
		t.Fatalf("acquire token2 failed: %v", err)
	}
	defer release2()

	if token2 != 2 {
		t.Errorf("token2 = %d, want 2", token2)
	}
	// token1 is now fenced out
	if lock.ValidateToken(token1) {
		t.Errorf("expected token1 to be invalid after token2 acquired")
	}
	if !lock.ValidateToken(token2) {
		t.Errorf("expected token2 to be valid")
	}
}

func TestMasterLockConcurrentAdvancement(t *testing.T) {
	lock := NewMasterLock(nil)

	var wg sync.WaitGroup
	tokens := make([]int64, 50)
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			tok, rel, _ := lock.Acquire(context.Background(), 1*time.Second)
			tokens[idx] = tok
			rel()
		}(i)
	}
	wg.Wait()

	seen := make(map[int64]bool)
	for _, tok := range tokens {
		if seen[tok] {
			t.Errorf("duplicate token generated: %d", tok)
		}
		seen[tok] = true
	}
	if lock.CurrentToken() != 50 {
		t.Errorf("current token = %d, want 50", lock.CurrentToken())
	}
}
