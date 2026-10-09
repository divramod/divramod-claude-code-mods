"""Every subagent of one Claude Code session: model, effort, calls, context now and peak, compactions, minutes.

Usage: python3 measure.py <session-id>  ->  JSON list on stdout.
A call's context is input + cache read + cache write tokens; a compaction is a `compact_boundary` entry or a fill
drop by more than half between two calls.
"""
import glob
import json
import os
import sys
from datetime import datetime


def stamp(text):
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    except (AttributeError, ValueError):
        return None


def measure(path):
    fills, compactions, prev, first, last, model = [], 0, 0, None, None, ""
    with open(path) as lines:
        for line in lines:
            try:
                e = json.loads(line)
            except ValueError:
                continue
            t = stamp(e.get("timestamp"))
            if t:
                first, last = first or t, t
            if e.get("type") == "system" and "compact" in str(e.get("subtype", "")):
                compactions += 1
            if e.get("type") != "assistant":
                continue
            m = e.get("message") or {}
            u = m.get("usage") or {}
            fill = sum(u.get(k) or 0 for k in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"))
            if not fill:
                continue
            if prev and fill < prev / 2:
                compactions += 1
            fills.append(fill)
            prev, model = fill, m.get("model") or model
    return {"calls": len(fills), "now": fills[-1] if fills else 0, "peak": max(fills, default=0),
            "compactions": compactions, "minutes": round((last - first) / 60, 1) if first and last else 0,
            "modelId": model, "mtime": os.path.getmtime(path)}


def main(session):
    rows = []
    for path in glob.glob(os.path.expanduser(f"~/.claude/projects/*/{session}/subagents/agent-*.jsonl")):
        meta = {}
        try:
            meta = json.load(open(path[: -len(".jsonl")] + ".meta.json"))
        except (OSError, ValueError):
            pass
        row = measure(path)
        row.update(id=os.path.basename(path)[6:-6], description=meta.get("description", ""),
                   model=meta.get("model") or row["modelId"], effort=meta.get("effort", ""))
        rows.append(row)
    rows.sort(key=lambda r: r["mtime"])
    print(json.dumps(rows))


if __name__ == "__main__":
    main(sys.argv[1])
