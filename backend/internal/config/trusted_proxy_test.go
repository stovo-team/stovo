package config

import (
	"reflect"
	"testing"
)

func TestLoadParsesExplicitTrustedProxyCIDRs(t *testing.T) {
	t.Setenv("TRUSTED_PROXY_CIDRS", "172.30.0.2/32, 127.0.0.1/32")
	got, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	want := []string{"172.30.0.2/32", "127.0.0.1/32"}
	if !reflect.DeepEqual(got.TrustedProxyCIDRs, want) {
		t.Fatalf("TrustedProxyCIDRs = %#v, want %#v", got.TrustedProxyCIDRs, want)
	}
}
