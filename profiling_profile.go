//go:build profile

package main

import (
	"errors"
	"log"
	"net"
	"net/http"
	"net/http/pprof"
	"os"
	"strings"
	"time"
)

const defaultProfileAddr = "127.0.0.1:6060"

func init() {
	addr, enabled, err := profileAddrFromEnv(os.Getenv("MARKPAD_PROFILE"))
	if !enabled {
		return
	}
	if err != nil {
		log.Printf("markpad profile server disabled: %v", err)
		return
	}

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		log.Printf("markpad profile server disabled: %v", err)
		return
	}

	server := &http.Server{
		Handler:           profileMux(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("markpad profile server listening on http://%s/debug/pprof/", listener.Addr())
	go func() {
		if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("markpad profile server stopped: %v", err)
		}
	}()
}

func profileAddrFromEnv(raw string) (string, bool, error) {
	value := strings.TrimSpace(raw)
	if value == "" || value == "0" || strings.EqualFold(value, "false") || strings.EqualFold(value, "off") {
		return "", false, nil
	}

	if value == "1" || strings.EqualFold(value, "true") || strings.EqualFold(value, "on") {
		value = defaultProfileAddr
	}
	if strings.HasPrefix(value, ":") {
		value = "127.0.0.1" + value
	}

	host, port, err := net.SplitHostPort(value)
	if err != nil {
		return "", true, err
	}
	if strings.TrimSpace(port) == "" {
		return "", true, errors.New("missing profile port")
	}
	if host == "" {
		host = "127.0.0.1"
		value = net.JoinHostPort(host, port)
	}
	if !isLoopbackHost(host) {
		return "", true, errors.New("MARKPAD_PROFILE must bind to localhost or a loopback address")
	}

	return value, true, nil
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func profileMux() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/debug/pprof/", pprof.Index)
	mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	mux.HandleFunc("/debug/pprof/trace", pprof.Trace)
	return mux
}
