"""
My Tool plugin.

TODO: describe what this tool does and which target type it expects.
"""
from __future__ import annotations

from my_new_tool import InputData, Plugin, Result


class MyTool(Plugin):
    name = "my_tool"
    description = "TODO: one-line summary shown in --list-plugins, the API and MCP."

    # Optional: declare your output fields so agents/clients know the shape.
    output_schema = {
        "type": "object",
        "properties": {
            "value": {"type": "string"},
        },
    }

    # Optional defaults; override via --option key=value, config or the API.
    default_options = {}

    async def run(self, target: InputData) -> Result:
        # `target.value` is the thing to investigate (username, domain, ...).
        # Talk to the network through self.ctx:
        #     status, text = await self.ctx.fetch_text(f"https://api/{target.value}")
        #     status, data = await self.ctx.fetch_json(f"https://api/{target.value}")
        # Read options with self.options.get("key").
        # Return a Result, a dict, a list of those, or None.
        return Result(value=target.value)
