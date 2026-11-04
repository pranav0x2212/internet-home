#!/usr/bin/env python3
"""Make link-preview cards (1200x630 PNGs) for posts.

For every dated page in site/content/blogs and site/content/til this renders
site/public/og/<section>-<name>.png (title + description on the site's dark
background) and adds a `previewimage:` line to the page's front matter.
Existing images are skipped, so it is safe to re-run after adding a post.

Needs: chromium on PATH.   Usage: python3 scripts/og.py [--force]
"""
import html, re, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "site/content"
OUT = ROOT / "site/public/og"
FORCE = "--force" in sys.argv

CARD = """<!doctype html><meta charset="utf-8"><style>
html,body{{margin:0;width:1200px;height:630px;background:#171c28;color:#e6eef8;
font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}}
.c{{box-sizing:border-box;width:1200px;height:630px;padding:70px 80px;display:flex;flex-direction:column;justify-content:space-between}}
.site{{color:#7aa2ff;font-size:34px;letter-spacing:.02em}}
h1{{margin:0 0 28px;font-size:{size}px;line-height:1.15;font-weight:700;letter-spacing:-.01em}}
p{{margin:0;font-size:32px;line-height:1.45;color:rgba(230,238,248,.65)}}
</style><div class="c"><div class="site">prawns.dev</div>
<div><h1>{title}</h1><p>{desc}</p></div></div>"""


def front(text):
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m:
        return None, {}
    data = {}
    for line in m.group(1).splitlines():
        k = re.match(r"^(title|description|date|previewimage):\s*(.*)$", line)
        if k:
            data[k.group(1)] = k.group(2).strip().strip('"').strip("'")
    return m, data


def render(title, desc, dest):
    size = 76 if len(title) < 45 else 62 if len(title) < 75 else 50
    if len(desc) > 150:
        desc = desc[:147].rsplit(" ", 1)[0] + "…"
    page = CARD.format(size=size, title=html.escape(title), desc=html.escape(desc))
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
        f.write(page)
    subprocess.run(["chromium", "--headless=new", "--no-sandbox", "--disable-gpu",
                    "--hide-scrollbars", "--window-size=1200,630",
                    f"--screenshot={dest}", f"file://{f.name}"],
                   check=True, capture_output=True, timeout=60)


OUT.mkdir(parents=True, exist_ok=True)
if FORCE or not (OUT / "default.png").exists():
    render("Pranav's Internet Home",
           "Computer architecture, memory systems and digital hardware design.",
           OUT / "default.png")
    print("default.png")

for md in sorted(CONTENT.glob("*/*.md")):
    if md.parent.name not in ("blogs", "til"):
        continue
    text = md.read_text()
    m, fm = front(text)
    if not m or not fm.get("date") or not fm.get("title"):
        continue
    name = f"{md.parent.name}-{md.stem}.png"
    if FORCE or not (OUT / name).exists():
        render(fm["title"], fm.get("description", ""), OUT / name)
        print(name)
    if "previewimage" not in fm:
        block = m.group(1) + f'\npreviewimage: "/og/{name}"'
        md.write_text(text.replace(m.group(0), f"---\n{block}\n---\n", 1))
