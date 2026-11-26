# my_new_tool — Web Workbench

A sleek dark-mode (`Carbon Crimson` / `Operate` mode) frontend for `my_new_tool`'s FastAPI server (`http://127.0.0.1:8080`), built with zero external build tooling and a Python standard-library reverse proxy so `my_new_tool/server.py` stays untouched.

## Quickstart

### Option A: Connect to an already-running FastAPI server

1. Start `my_new_tool` FastAPI backend (if not already running):
   ```powershell
   C:\Users\cam2t\AppData\Local\Programs\Python\Python310\python.exe -m my_new_tool --server 127.0.0.1:8080
   ```
2. Start the Web Workbench proxy server:
   ```powershell
   C:\Users\cam2t\AppData\Local\Programs\Python\Python310\python.exe serve.py --port 3000 --backend http://127.0.0.1:8080
   ```
3. Open `http://127.0.0.1:3000` in your browser.

### Option B: Launch both backend and frontend in one command

```powershell
C:\Users\cam2t\AppData\Local\Programs\Python\Python310\python.exe serve.py --with-backend
```

## Capabilities

- **Auto-discovered Plugin Rail (`GET /plugins`)**: Lists every registered `my_new_tool` plugin (`my_tool`, `http_title`, `string_info`, plus any new files added to `my_new_tool/plugins/`).
- **Schema Contract Inspector (`GET /plugins/{name}/schema`)**: Displays output field types and auto-generates typed inputs for `default_options`, plus free-form key/value options.
- **Batch Execution (`POST /plugins/{name}/run`)**: Multi-line target input, `.txt` target list import, runtime overrides (`concurrency`, `timeout`, `proxy`), abortable requests, and `Copy cURL` export.
- **Adaptive Results & Reports**: Schema-driven `Table view`, `Target groups`, and `Raw JSON` tabs with one-click `Export JSON`, `Export CSV`, and `Export TXT` downloads matching `my_new_tool` CLI reporters.
