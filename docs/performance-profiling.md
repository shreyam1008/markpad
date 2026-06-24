# Markpad performance profiling

Markpad keeps profiling code out of normal release builds. Use the `profile` build tag only when collecting local diagnostics.

## Build and run with pprof

```sh
make profile-run
```

By default this starts the Go pprof server on:

```text
http://127.0.0.1:6060/debug/pprof/
```

To choose a different loopback port:

```sh
MARKPAD_PROFILE=127.0.0.1:7070 ./dist/markpad-profile
```

`MARKPAD_PROFILE` refuses non-loopback addresses so profiling endpoints are not exposed to the network.

## Capture profiles

CPU profile:

```sh
curl -o /tmp/markpad.cpu.pprof "http://127.0.0.1:6060/debug/pprof/profile?seconds=20"
go tool pprof -http=:0 /tmp/markpad.cpu.pprof
```

Heap profile:

```sh
curl -o /tmp/markpad.heap.pprof "http://127.0.0.1:6060/debug/pprof/heap"
go tool pprof -http=:0 /tmp/markpad.heap.pprof
```

Execution trace:

```sh
curl -o /tmp/markpad.trace "http://127.0.0.1:6060/debug/pprof/trace?seconds=5"
go tool trace /tmp/markpad.trace
```

## What this measures

Go pprof measures the Go process heap, CPU, goroutines, mutexes, blocking, and traces. It does not fully measure WebKit/WebView renderer memory, GPU memory, or JavaScript heap. Pair profile builds with:

```sh
make memory
make smoke-desktop
```

For release-size checks, keep using:

```sh
make build
make budget
```
