//go:build profile

package main

import "testing"

func TestProfileAddrFromEnv(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		want    string
		enabled bool
		wantErr bool
	}{
		{
			name:    "empty disables profiling",
			value:   "",
			enabled: false,
		},
		{
			name:    "false disables profiling",
			value:   "false",
			enabled: false,
		},
		{
			name:    "one uses default loopback address",
			value:   "1",
			want:    defaultProfileAddr,
			enabled: true,
		},
		{
			name:    "true uses default loopback address",
			value:   "true",
			want:    defaultProfileAddr,
			enabled: true,
		},
		{
			name:    "bare port binds to loopback",
			value:   ":7070",
			want:    "127.0.0.1:7070",
			enabled: true,
		},
		{
			name:    "localhost is allowed",
			value:   "localhost:7070",
			want:    "localhost:7070",
			enabled: true,
		},
		{
			name:    "ipv4 loopback is allowed",
			value:   "127.0.0.1:7070",
			want:    "127.0.0.1:7070",
			enabled: true,
		},
		{
			name:    "wildcard bind is rejected",
			value:   "0.0.0.0:6060",
			enabled: true,
			wantErr: true,
		},
		{
			name:    "lan bind is rejected",
			value:   "192.168.1.20:6060",
			enabled: true,
			wantErr: true,
		},
		{
			name:    "missing port is rejected",
			value:   "127.0.0.1",
			enabled: true,
			wantErr: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, enabled, err := profileAddrFromEnv(test.value)
			if enabled != test.enabled {
				t.Fatalf("enabled = %v, want %v", enabled, test.enabled)
			}
			if test.wantErr {
				if err == nil {
					t.Fatal("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != test.want {
				t.Fatalf("addr = %q, want %q", got, test.want)
			}
		})
	}
}
