# OSINT cli tool skeleton

<p align="center">
  <p align="center">
    <a href="https://pypi.org/project/osint-cli-tool-skeleton/">
      <img alt="PyPI" src="https://img.shields.io/pypi/v/osint-cli-tool-skeleton?style=flat-square">
    </a>
    <a href="https://pypi.org/project/osint-cli-tool-skeleton/">
      <img alt="PyPI - Downloads" src="https://img.shields.io/pypi/dw/osint-cli-tool-skeleton?style=flat-square">
    </a>
    <a href="https://pypi.org/project/osint-cli-tool-skeleton/">
      <img alt="Views" src="https://komarev.com/ghpvc/?username=osint-cli-tool-skeleton&color=brightgreen&label=views&style=flat-square">
    </a>
  </p>
  <p align="center">
    <img src="https://raw.githubusercontent.com/soxoj/osint-cli-tool-skeleton/main/pictures/logo.png" height="200"/>
  </p>
</p>

A universal, **AI-native** template for building OSINT tools.

Write **one plugin file**, and the same logic instantly works as a **CLI**, a
**Python library**, an **HTTP microservice** (FastAPI) and an **MCP server** for
AI agents — with concurrency, proxying, reports and config handled for you.

> **Press "[Use this template](https://github.com/soxoj/osint-cli-tool-skeleton/generate)"** to start your own tool, then see [INSTALL.md](INSTALL.md).

## Why this skeleton

- **Universal** — plugins return arbitrary fields; nothing is hardcoded to one
  data shape. Build a username checker, a domain enricher, a leak lookup, anything.
- **Easy to customize** — add a capability by dropping one file in `plugins/`.
  You never touch the engine, CLI, server or reports.
- **Embeddable** — clean sync (`run_tool`) and async (`arun_tool`) library API,
  plus a FastAPI app factory for microservices and pipelines.
- **AI-native** — every plugin is auto-exposed as an MCP tool, and
  [AGENTS.md](AGENTS.md) is a ready brief: point an agent at the repo and say
  "build a tool based on this".

## Architecture

```
                       your plugins/  (subclass Plugin, implement run())
                              │  auto-discovered & registered
                              ▼
   CLI ─┐                  ┌─────────┐
   lib ─┼──> Settings ──>  │ Engine  │ ──> Reporters (plain/csv/txt/json)
  HTTP ─┤   (file/env/CLI) │ +Context│      Result / ResultSet (any fields)
   MCP ─┘                  └─────────┘
```

## Quickstart

```sh
pip install -e .
python -m my_new_tool --list-plugins
python -m my_new_tool --plugin http_title example.com reddit.com
```

```
Target: example.com
Results found: 1
1) Value: Example Domain
   Code: 200
------------------------------
Total found: 1
```

## Write a tool (the only thing you edit)

```sh
python -m my_new_tool --new-plugin my_tool
```

```python
# my_new_tool/plugins/my_tool.py
from my_new_tool import InputData, Plugin, Result

class MyTool(Plugin):
    name = "my_tool"
    description = "Look up something for a target."

    async def run(self, target: InputData) -> Result:
        status, data = await self.ctx.fetch_json(f"https://api.example/{target.value}")
        return Result(found=data.get("found"), code=status)
```

That's it — `my_tool` now works on the CLI, as a library call, over HTTP and as
an MCP tool. Full contract in [AGENTS.md](AGENTS.md).

<details>
<summary><b>Inputs</b> — args, file, or stdin</summary>

```sh
my_new_tool a.com b.com c.com          # positional
my_new_tool --target-list targets.txt  # from a file
cat list.txt | my_new_tool --targets-from-stdin
```
</details>

<details>
<summary><b>Reports</b> — console, CSV, TXT, JSON</summary>

```sh
my_new_tool a.com b.com -oC out.csv -oJ out.json -oT out.txt
my_new_tool a.com --format json        # JSON to stdout
```

Reports are schema-driven: columns/fields adapt to whatever your plugin emits.
```sh
$ cat out.json | jq '.[0]'
{ "input": { "value": "a.com" }, "results": [ { "value": "Site A", "code": 200 } ] }
```
</details>

<details>
<summary><b>Library</b> — embed in your own code / pipeline</summary>

```python
from my_new_tool import run_tool          # sync
results = run_tool("http_title", ["example.com"], proxy="socks5://127.0.0.1:1080")
for rs in results:
    print(rs.input_data, [r.fields for r in rs.results])

# inside an existing event loop:
from my_new_tool import arun_tool
results = await arun_tool("http_title", ["example.com"])
```
</details>

<details>
<summary><b>HTTP microservice</b> — FastAPI + OpenAPI</summary>

```sh
pip install -e '.[server]'
my_new_tool --server 0.0.0.0:8080      # docs at /docs
```

```sh
curl localhost:8080/plugins/http_title/run \
  -d '{"targets": ["google.com", "yahoo.com"]}' -s | jq
```

Endpoints: `GET /plugins`, `GET /plugins/{name}/schema`,
`POST /plugins/{name}/run`, `POST /run`. For your own ASGI deployment:
`from my_new_tool.server import create_app; app = create_app()`.

Or run it in Docker:
```sh
docker build -t osint-tool . && docker run -p 8080:8080 osint-tool
```
</details>

<details>
<summary><b>MCP server</b> — for AI agents</summary>

```sh
pip install -e '.[mcp]'
my_new_tool --mcp        # stdio MCP server
```

Every plugin becomes an MCP tool named after it, taking `targets` and optional
`options`. Register it with your agent/host as the command
`my_new_tool --mcp`.
</details>

<details>
<summary><b>Configuration</b> — file / env / CLI</summary>

Precedence: **defaults < config file < `OSINT_*` env < CLI flags**.

```toml
# osint.toml (auto-detected in cwd, or pass --config)
[osint]
plugin = "http_title"
proxy = "socks5://127.0.0.1:1080"
concurrency = 20
[osint.options]
api_key = "..."
```

```sh
OSINT_PROXY=socks5://127.0.0.1:1080 my_new_tool example.com
my_new_tool --plugin my_tool --option api_key=XXX --concurrency 20 t
```

See [`examples/osint.example.toml`](examples/osint.example.toml).
</details>

## Installation

Requires Python ≥ 3.10.

```sh
pip install my_new_tool            # from PyPI (core)
pip install 'my_new_tool[all]'     # + server, mcp, yaml
```

…or clone and `pip install -e '.[all,dev]'`. Details in [INSTALL.md](INSTALL.md).

## Development

```sh
make install-dev   # editable install with dev tools
make test          # pytest + coverage
make lint          # flake8 + mypy
make format        # black
```

## License

MIT
