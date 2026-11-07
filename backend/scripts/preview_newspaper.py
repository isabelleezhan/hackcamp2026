"""Run real Gemini on a week of notes and print the validated newspaper. No database needed.

Use it to judge the writing and tune EDITOR_RULES in app/providers.py.

    cd backend
    .venv/bin/python -m scripts.preview_newspaper                     # uses scripts/sample_notes.json
    .venv/bin/python -m scripts.preview_newspaper my_notes.json
    .venv/bin/python -m scripts.preview_newspaper --edition ../frontend/src/features/edition/sample-edition.json
    .venv/bin/python -m scripts.preview_newspaper --email-from ../frontend/src/features/edition/sample-edition.json

--edition also writes sample-email.json (the edition email) next to the edition file.
--email-from only rebuilds that email from an existing edition file: no Gemini call.

Needs GEMINI_API_KEY (and optionally GEMINI_MODEL) in backend/.env. Notes are a JSON list of
edition_sources-shaped rows: reflection_id, user_id, display_name, body, and optional city, recorded_at.
"""

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

import httpx

from app.config import Settings
from app.providers import Gemini, email_payload

HERE = Path(__file__).parent
SAMPLE_GROUP = "The Long-Distance Weekly"


def write_email(edition: dict, edition_path: Path, settings: Settings) -> None:
    """Save the edition email next to the edition file, for the frontend's Email preview."""
    email = email_payload(settings, {"recipient_email": "you@example.com"}, edition, SAMPLE_GROUP)
    email["from"] = email["from"] or f"{SAMPLE_GROUP} <paper@example.com>"
    out = edition_path.with_name("sample-email.json")
    out.write_text(json.dumps(email, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {out}", file=sys.stderr)


def print_paper(paper: dict) -> None:
    print(f"\n{paper['headline'].upper()}\n{paper['introduction']}\n")
    for update in paper["member_updates"]:
        dateline = f"{update['dateline'].upper()} — " if update.get("dateline") else ""
        print(f"## {update['headline']}  (by {update['display_name']})")
        print(f"{dateline}{update['text']}")
        print(
            f"   [{len(update['source_reflection_ids'])} notes, {len(update['text'].split())} words]\n"
        )
    for title, key in (
        ("Little victories", "little_victories"),
        ("Looking ahead", "looking_ahead"),
    ):
        if paper[key]:
            print(f"-- {title}")
            for item in paper[key]:
                print(f"   * {item['headline']}: {item['text']}")
    print()


async def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("notes", nargs="?", default=HERE / "sample_notes.json", type=Path)
    parser.add_argument(
        "--json", action="store_true", help="print raw JSON instead of a readable paper"
    )
    parser.add_argument(
        "--edition", type=Path, help="also write an edition object the frontend preview can load"
    )
    parser.add_argument(
        "--email-from", type=Path, help="only rebuild sample-email.json from this edition file"
    )
    args = parser.parse_args()

    settings = Settings()
    if args.email_from:
        write_email(json.loads(args.email_from.read_text()), args.email_from, settings)
        return 0
    if not settings.gemini_api_key.get_secret_value():
        print("Set GEMINI_API_KEY in backend/.env first.", file=sys.stderr)
        return 1
    sources = json.loads(args.notes.read_text())
    started = time.monotonic()
    async with httpx.AsyncClient() as client:
        paper = (await Gemini(settings, client).newspaper(sources)).model_dump(mode="json")
    took = time.monotonic() - started

    print(json.dumps(paper, indent=2, ensure_ascii=False)) if args.json else print_paper(paper)
    words = sum(len(u["text"].split()) for u in paper["member_updates"])
    print(
        f"Validated. {settings.gemini_model}, {took:.1f} s, {words} words in stories.",
        file=sys.stderr,
    )

    if args.edition:
        edition = {
            "id": "e0000000-0000-4000-8000-000000000012",
            "group_id": "c0000000-0000-4000-8000-000000000001",
            "period_id": "d0000000-0000-4000-8000-000000000012",
            "issue_number": 12,
            "status": "published",
            "content": paper,
            "generation_error": None,
            "generation_attempts": 1,
            "published_at": "2026-11-08T18:00:00-08:00",
            "created_at": "2026-11-08T18:00:00-08:00",
        }
        args.edition.write_text(json.dumps(edition, indent=2, ensure_ascii=False) + "\n")
        print(f"Wrote {args.edition}", file=sys.stderr)
        write_email(edition, args.edition, settings)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
