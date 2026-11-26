"""
HTTP/JSON endpoint health & schema probe.

Tests local dev servers (FastAPI/Node) or live APIs and reports status, latency, and JSON keys.
"""
from __future__ import annotations

import time
from my_new_tool import InputData, Plugin, Result


class EndpointProbe(Plugin):
    name = "endpoint_probe"
    description = "Probe a URL/API endpoint for HTTP status, latency (ms), content-type, and JSON keys."

    output_schema = {
        "type": "object",
        "properties": {
            "url": {"type": "string"},
            "status": {"type": "integer"},
            "latency_ms": {"type": "integer"},
            "content_type": {"type": "string"},
            "json_keys": {"type": "string"},
            "preview": {"type": "string"},
        },
    }

    default_options = {}

    async def run(self, target: InputData) -> Result:
        url = target.value.strip()
        if not url.startswith(("http://", "https://")):
            url = f"http://{url}"

        start = time.perf_counter()
        status, data = await self.ctx.fetch_json(url)
        elapsed_ms = int((time.perf_counter() - start) * 1000)

        if isinstance(data, dict):
            keys = ", ".join(list(data.keys())[:15])
            return Result(
                url=url,
                status=status,
                latency_ms=elapsed_ms,
                content_type="application/json",
                json_keys=keys or "(empty object)",
                preview=str(data)[:200],
            )
        if isinstance(data, list):
            return Result(
                url=url,
                status=status,
                latency_ms=elapsed_ms,
                content_type="application/json (list)",
                json_keys=f"list[{len(data)}]",
                preview=str(data[:2])[:200],
            )

        status_txt, text = await self.ctx.fetch_text(url)
        return Result(
            url=url,
            status=status_txt,
            latency_ms=elapsed_ms,
            content_type="text/html or plain",
            json_keys="N/A",
            preview=(text or "").strip().replace("\n", " ")[:200],
        )
