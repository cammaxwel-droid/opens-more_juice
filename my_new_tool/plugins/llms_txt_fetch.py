"""
llms.txt documentation fetcher.

Fetches /llms.txt (or /llms-full.txt) from a docs domain for low-token builder context.
"""
from __future__ import annotations

from my_new_tool import InputData, Plugin, Result


class LlmsTxtFetch(Plugin):
    name = "llms_txt_fetch"
    description = "Fetch /llms.txt from a site or docs URL to give builder agents clean, low-token docs."

    output_schema = {
        "type": "object",
        "properties": {
            "url": {"type": "string"},
            "code": {"type": "integer"},
            "chars": {"type": "integer"},
            "content": {"type": "string"},
        },
    }

    default_options = {
        "full": "false",
        "max_chars": 4000,
    }

    async def run(self, target: InputData) -> Result | None:
        base = target.value.strip().rstrip("/")
        if not base.startswith(("http://", "https://")):
            base = f"https://{base}"

        use_full = str(self.options.get("full", "false")).lower() == "true"
        max_chars = int(self.options.get("max_chars", 4000))
        candidates = ["/llms-full.txt", "/llms.txt"] if use_full else ["/llms.txt", "/llms-full.txt"]

        for suffix in candidates:
            url = f"{base}{suffix}"
            status, text = await self.ctx.fetch_text(url)
            if status == 200 and text and "<html" not in text[:200].lower():
                return Result(
                    url=url,
                    code=status,
                    chars=len(text),
                    content=text[:max_chars],
                )
        return None
