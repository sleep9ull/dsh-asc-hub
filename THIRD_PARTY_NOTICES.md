# Third-party notices

`dsh-asc-hub` is a console built on top of the open-source App Store Connect CLI,
[`App-Store-Connect-CLI`](https://github.com/rorkai/App-Store-Connect-CLI) (`asc`). This file records
the license of that dependency and states the distribution boundary.

The plugin itself bundles no third-party source code and declares no runtime
dependencies. The `asc` CLI is not bundled, not vendored, and not copied into this
repository.

## App-Store-Connect-CLI (`asc`)

| | |
|---|---|
| Project | <https://github.com/rorkai/App-Store-Connect-CLI> |
| Homepage | <https://asccli.sh> |
| Binary | `asc` (Go, installed via Homebrew, the official install script, WinGet, or a release binary) |
| License | MIT |
| Copyright | Copyright (c) 2026 Rudrank Riyam |

### How this product uses it

`dsh-asc-hub` installs the CLI for the user (Homebrew or the official install
script) and then invokes the installed `asc` binary as an external program,
passing arguments and reading its JSON output, exit codes and stderr. No `asc`
source file, module or asset is copied into, linked into, or modified by this
plugin. A user can uninstall `asc` at any time and the plugin stops working
until it is reinstalled; upgrading `asc` upgrades the plugin's capabilities.

The MIT notice below is reproduced because this product's documentation and
install flow distribute and drive the CLI, and because MIT requires the notice
to accompany copies and substantial portions of the software. If you
redistribute `asc` yourself — for example in an internal installer that ships
the binary — that copy must carry this notice as well.

### MIT license text

```text
MIT License

Copyright (c) 2026 Rudrank Riyam

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Native components inside the `asc` binary

Release binaries of `asc` may embed native components, such as `libfido2` in
security-key builds. Those licenses apply to the separately installed binary you
receive from the `asc` project, not to this plugin. The authoritative list is
embedded in the binary:

```bash
asc docs show third-party-notices
```

## Apple

This project is an independent, unofficial tool. It is not affiliated with,
endorsed by, or sponsored by Apple Inc. App Store Connect, TestFlight, Xcode
Cloud, and Apple are trademarks of Apple Inc., registered in the U.S. and other
countries.

This project is also independent of the `asc` maintainers and is not endorsed
by them.
