"""Build an isolated profiling executable; never ship this executable.

A private copy of the existing WebView2 module enables localhost CDP. The
application source and module cache stay unchanged. Runtime is otherwise a
production build. Normal release builds never include the debugger argument.
"""
import json
import pathlib
import subprocess
import shutil
import sys

if sys.platform != "win32":
    raise SystemExit("This profiling builder requires Windows")
module = json.loads(subprocess.check_output(
    ["go", "list", "-m", "-json", "github.com/wailsapp/go-webview2"], text=True
))
copy = pathlib.Path("dist/performance/webview-profile").resolve()
shutil.copytree(module["Dir"], copy, dirs_exist_ok=True, copy_function=shutil.copyfile)
source = copy / "pkg/edge/chromium.go"
original = source.read_text()
needle = 'browserArgs := strings.Join(e.AdditionalBrowserArgs, " ")'
if original.count(needle) != 1:
    raise SystemExit("WebView2 argument setup changed; review profiling instrumentation")
source.write_text(original.replace(needle, needle + ' + " --remote-debugging-port=49271"'))
mod = pathlib.Path("dist/performance/perf.mod").resolve()
shutil.copyfile("go.mod", mod)
shutil.copyfile("go.sum", mod.with_suffix(".sum"))
subprocess.run([
    "go", "mod", "edit", "-modfile", str(mod),
    "-replace=github.com/wailsapp/go-webview2=" + str(copy),
], check=True)
subprocess.run([
    "go", "build", "-modfile", str(mod), "-tags", "production,webkit2_41",
    "-trimpath", "-ldflags",
    "-s -w -H windowsgui -X main.singleInstanceID=quillpane-performance-isolated-20260912",
    "-o", sys.argv[1] if len(sys.argv) > 1 else "dist/performance/quillpane-profile.exe", ".",
], check=True)
