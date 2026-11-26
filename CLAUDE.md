See [AGENTS.md](AGENTS.md) for how to build a tool from this skeleton.

TL;DR: add capabilities by creating **one plugin file** in
`my_new_tool/plugins/` — subclass `Plugin`, implement
`async def run(self, target)`. Never edit the engine, CLI, server or reports.
Scaffold with `python -m my_new_tool --new-plugin <name>`.
