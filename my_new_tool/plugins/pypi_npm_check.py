"""
PyPI & npm package version checker.

Queries live PyPI and npm registries so builder agents use real, current versions.
"""
from __future__ import annotations

from my_new_tool import InputData, Plugin, Result


class PyPiNpmCheck(Plugin):
    name = "pypi_npm_check"
    description = "Check latest version and metadata for a Python (PyPI) or JS/TS (npm) package."

    output_schema = {
        "type": "object",
        "properties": {
            "registry": {"type": "string"},
            "package": {"type": "string"},
            "latest_version": {"type": "string"},
            "summary": {"type": "string"},
            "homepage": {"type": "string"},
            "code": {"type": "integer"},
        },
    }

    default_options = {
        "registry": "auto",  # auto, pypi, or npm
    }

    async def run(self, target: InputData) -> list[Result]:
        pkg = target.value.strip()
        reg = str(self.options.get("registry", "auto")).lower()
        results: list[Result] = []

        if reg in ("auto", "pypi"):
            status, data = await self.ctx.fetch_json(f"https://pypi.org/pypi/{pkg}/json")
            if status == 200 and isinstance(data, dict):
                info = data.get("info", {})
                results.append(
                    Result(
                        registry="pypi",
                        package=info.get("name", pkg),
                        latest_version=info.get("version", ""),
                        summary=(info.get("summary") or "")[:160],
                        homepage=info.get("home_page") or info.get("project_url") or f"https://pypi.org/project/{pkg}/",
                        code=status,
                    )
                )

        if reg in ("auto", "npm"):
            status, data = await self.ctx.fetch_json(f"https://registry.npmjs.org/{pkg}/latest")
            if status == 200 and isinstance(data, dict):
                results.append(
                    Result(
                        registry="npm",
                        package=data.get("name", pkg),
                        latest_version=data.get("version", ""),
                        summary=(data.get("description") or "")[:160],
                        homepage=data.get("homepage") or f"https://www.npmjs.com/package/{pkg}",
                        code=status,
                    )
                )

        return results
