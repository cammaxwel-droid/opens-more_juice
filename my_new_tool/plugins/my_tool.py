"""
Domain DNS lookup plugin.

Queries A, AAAA, MX, and TXT records for a target domain via DNS-over-HTTPS.
"""
from __future__ import annotations

from my_new_tool import InputData, Plugin, Result


class MyTool(Plugin):
    name = "my_tool"
    description = "Resolve DNS records (A, AAAA, MX, TXT) for a target domain."

    output_schema = {
        "type": "object",
        "properties": {
            "domain": {"type": "string"},
            "record_type": {"type": "string"},
            "records": {"type": "array", "items": {"type": "string"}},
            "code": {"type": "integer"},
        },
    }

    default_options = {
        "types": "A,MX,TXT",
    }

    async def run(self, target: InputData) -> list[Result]:
        domain = target.value.strip().removeprefix("https://").removeprefix("http://").split("/")[0]
        raw_types = str(self.options.get("types", "A,MX,TXT"))
        record_types = [t.strip().upper() for t in raw_types.split(",") if t.strip()]

        results: list[Result] = []
        for rtype in record_types:
            url = f"https://cloudflare-dns.com/dns-query?name={domain}&type={rtype}"
            status, data = await self.ctx.fetch_json(
                url,
                headers={"Accept": "application/dns-json"},
            )
            answers = data.get("Answer", []) if isinstance(data, dict) else []
            values = [ans.get("data", "") for ans in answers if ans.get("data")]
            if values:
                results.append(
                    Result(
                        domain=domain,
                        record_type=rtype,
                        records=", ".join(values),
                        code=status,
                    )
                )
        return results