"""Tjekker at et udkast kun bruger tal, der findes i værktøjsresultaterne.

Det er agentens vigtigste værn mod opfundne tal: modellen må gerne vælge,
hvilke tal der er interessante, og runde dem af, men den må ikke selv
finde på et tal. Fejler tjekket, sendes fejlen tilbage som tool_result, og
modellen får chancen for at rette udkastet.
"""
from __future__ import annotations

import re
from typing import Any, Iterable

# "12.456", "12,5", "1.234,5", "2024", "3"
NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)*")


def parse_danish_number(token: str) -> tuple[float, int]:
    """Returnerer (værdi, antal decimaler). Punktum er tusindtalsseparator,
    komma er decimaltegn, som på dansk."""
    if "," in token:
        whole, _, frac = token.rpartition(",")
        whole = whole.replace(".", "")
        return float(f"{whole}.{frac}"), len(frac)
    parts = token.split(".")
    if len(parts) > 1 and all(len(p) == 3 for p in parts[1:]):
        return float("".join(parts)), 0
    # "23.4" i engelsk notation (kan optræde i værktøjsoutput)
    return float(token), len(parts[1]) if len(parts) == 2 else 0


def numbers_in_text(text: str) -> list[tuple[str, float, int]]:
    return [(m.group(0), *parse_danish_number(m.group(0))) for m in NUMBER_RE.finditer(text)]


def numbers_in_result(value: Any) -> set[float]:
    """Alle tal i et (JSON-)værktøjsresultat, også dem inde i strenge som
    datoer ('2025-09-28T16:00') og resultater ('2-1')."""
    found: set[float] = set()
    if isinstance(value, bool) or value is None:
        return found
    if isinstance(value, (int, float)):
        found.add(abs(float(value)))
    elif isinstance(value, str):
        # Engelsk notation i værktøjsstrenge: split på ikke-tal-tegn
        found.update(float(t) for t in re.findall(r"\d+(?:\.\d+)?", value))
    elif isinstance(value, dict):
        for k, v in value.items():
            found |= numbers_in_result(k) | numbers_in_result(v)
    elif isinstance(value, (list, tuple)):
        for v in value:
            found |= numbers_in_result(v)
    return found


def is_grounded(value: float, decimals: int, sources: Iterable[float]) -> bool:
    """Et tal er grundet, hvis en kilde afrundet til samme præcision giver tallet."""
    return any(round(s, decimals) == value for s in sources)


def ungrounded_numbers(text: str, results: Iterable[Any]) -> list[str]:
    sources = set()
    for r in results:
        sources |= numbers_in_result(r)
    return [tok for tok, value, dec in numbers_in_text(text) if not is_grounded(value, dec, sources)]
