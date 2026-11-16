"""Builds data/prompts.json for Meowsand.

Rarity model (no players needed):
  * Hand-written lists are ordered by how obvious each answer is, so rank gives
    a Zipf-style share:  share ~ 1 / (rank + 2) ** 1.25
  * Every answer also gets a real-world word frequency from the `wordfreq`
    package (how often the word shows up in books, web, subtitles, etc.).
  * The two are blended (geometric mean) and normalised to 100% per prompt.
  * "1 in N" = 1 / share.  That's what the game shows and scores.

Usage:
  pip install wordfreq
  git clone --depth 1 https://github.com/dariusk/corpora.git   (optional, adds ~25 prompts)
  python tools/build_data.py [path/to/corpora]
"""
import json, math, os, re, sys, unicodedata
from wordfreq import zipf_frequency

sys.path.insert(0, os.path.dirname(__file__))
from categories import HANDWRITTEN, CORPORA

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORPORA_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "corpora")
OUT = os.path.join(ROOT, "data", "prompts.json")
MAX_N = 250_000  # cap so nothing is "1 in a billion"


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]", "", s)
    s = re.sub(r"^the ", "", s.strip())
    return re.sub(r"\s+", " ", s).strip()


def freq(name):
    z = zipf_frequency(name, "en")
    if z == 0:  # unknown phrase: try its last word, heavily penalised
        z = max(0.0, zipf_frequency(name.split()[-1], "en") - 2.5)
    return max(z, 0.5)


def score(entries, ordered, head_len=None, tail_mass=0.12):
    """entries: list of [display, alias...]. Returns list of dicts with n (1-in-N)."""
    k = len(entries)
    weights = []
    for i, names in enumerate(entries):
        f = 10 ** (0.8 * freq(names[0]))  # word-frequency share
        if ordered:
            r = 1 / (i + 2) ** 1.25
            # normalise both scales roughly, then geometric mean (rank weighted more)
            weights.append((r ** 0.7) * ((f / 1e4) ** 0.3))
        else:
            weights.append(f)
    h = head_len if head_len is not None else len(entries)
    hw, tw = sum(weights[:h]), sum(weights[h:])
    shares = [w / hw * (1 - tail_mass if tw else 1) for w in weights[:h]]
    shares += [w / tw * tail_mass for w in weights[h:]] if tw else []
    out = []
    for names, share in zip(entries, shares):
        out.append({
            "a": names[0],
            "k": sorted({norm(x) for x in names if norm(x)}),
            "n": int(min(MAX_N, max(2, round(1 / share)))),
        })
    out.sort(key=lambda e: e["n"])
    return out


def parse_hand(text):
    items, seen = [], set()
    for raw in re.split(r"[,\n]", text):
        raw = raw.strip()
        if not raw:
            continue
        names = [x.strip() for x in raw.split("|") if x.strip()]
        key = norm(names[0])
        if key in seen:
            continue
        seen.add(key)
        items.append(names)
    return items


def load_corpus(path, key, field):
    d = json.load(open(os.path.join(CORPORA_DIR, "data", path), encoding="utf8"))
    if isinstance(key, list):
        lst = sum((d[k] for k in key), [])
    elif key:
        lst = d[key]
    else:
        lst = d if isinstance(d, list) else next(v for v in d.values() if isinstance(v, list))
    names = []
    for x in lst:
        if isinstance(x, dict):
            x = x.get(field) or x.get("name")
        for y in (x if isinstance(x, list) else [x]):
            if isinstance(y, str):
                y = re.sub(r"\s*\(.*?\)\s*", " ", y).strip()
                if 1 < len(y) < 40:
                    names.append(y)
    return names


def build(q, text):
    head = parse_hand(text)
    seen = {norm(a) for names in head for a in names}
    tail = []
    if os.path.isdir(CORPORA_DIR):
        for src in CORPORA.get(q, []):
            try:
                names = load_corpus(*src)
            except Exception as e:
                print("  skip", q, src[0], "->", e)
                continue
            for n in names:
                k = norm(n)
                # skip duplicates and plain common English words (e.g. "Fish" in a dinosaur list)
                if not k or k in seen or zipf_frequency(n, "en") >= 4.2:
                    continue
                seen.add(k)
                tail.append([n])
    tail.sort(key=lambda e: -freq(e[0]))  # better-known tail answers first
    return score(head + tail, ordered=True, head_len=len(head))


prompts = [{"q": q, "answers": build(q, text)} for q, text in HANDWRITTEN.items()]

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf8") as f:
    json.dump({"version": 1, "prompts": prompts}, f, separators=(",", ":"), ensure_ascii=False)

total = sum(len(p["answers"]) for p in prompts)
print(f"{len(prompts)} prompts, {total} answers -> {OUT} ({os.path.getsize(OUT)//1024} KB)")
