package identity

import (
	"context"
	"errors"
	"testing"
)

type loginAccountStoreFake struct {
	account LoginAccount
	err     error
	got     string
}

func (f *loginAccountStoreFake) LoginAccountByUsername(_ context.Context, username string) (LoginAccount, error) {
	f.got = username
	return f.account, f.err
}

func (f *loginAccountStoreFake) LoginAccountByID(_ context.Context, id string) (LoginAccount, error) {
	f.got = id
	return f.account, f.err
}

func TestLoginAccountServiceDelegatesLookup(t *testing.T) {
	store := &loginAccountStoreFake{account: LoginAccount{ID: "user-1"}}
	got, err := NewLoginAccountService(store).ByUsername(context.Background(), "Ada")
	if err != nil || got.ID != "user-1" || store.got != "Ada" {
		t.Fatalf("got account=%+v err=%v username=%q", got, err, store.got)
	}
}

func TestLoginAccountServicePropagatesStoreError(t *testing.T) {
	want := errors.New("store unavailable")
	_, err := NewLoginAccountService(&loginAccountStoreFake{err: want}).ByUsername(context.Background(), "Ada")
	if !errors.Is(err, want) {
		t.Fatalf("got %v, want %v", err, want)
	}
}

func TestLoginAccountServiceDelegatesIDLookup(t *testing.T) {
	store := &loginAccountStoreFake{account: LoginAccount{ID: "user-1"}}
	got, err := NewLoginAccountService(store).ByID(context.Background(), "user-1")
	if err != nil || got.ID != "user-1" || store.got != "user-1" {
		t.Fatalf("got account=%+v err=%v id=%q", got, err, store.got)
	}
}
