"""Builds data/prompts.json (the Classic pack).

  bash tools/fetch_sources.sh          # once: downloads ../corpora and ../sources
  pip install wordfreq
  python tools/build_data.py

Rarity: hand-written lists are ordered most→least common; open datasets add a
long tail of rarer valid answers (see rarity.py).
"""
import csv, collections, glob, json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from rarity import norm, freq, parse_hand, score
from wordfreq import zipf_frequency
from categories import HANDWRITTEN, CORPORA
from categories_more import MORE
from categories_extend import EXTEND, NEW

ROOT = os.path.dirname(HERE)
CORPORA_DIR = os.path.join(ROOT, "..", "corpora")
SOURCES = os.path.join(ROOT, "..", "sources")
OUT = os.path.join(ROOT, "data", "prompts.json")

PROMPTS = dict(HANDWRITTEN)
MORE = dict(MORE)
MORE["Name a singer or band"] = MORE.pop("Name a famous musician or band")
PROMPTS.update(MORE)
PROMPTS.update(NEW)
for path in sorted(glob.glob(os.path.join(HERE, "generated", "*.txt"))):
    q, _, body = open(path, encoding="utf8").read().partition("\n")
    if q.strip() and q.strip() not in PROMPTS and body.count(",") >= 20:
        PROMPTS[q.strip()] = body

# extra corpora tails for the expanded prompts
CORPORA.update({
    "Name a fruit": [("foods/fruits.json", None, None)],
    "Name a vegetable": [("foods/vegetables.json", None, None)],
    "Name an animal": [("animals/common.json", None, None)],
    "Name a cat breed": [("animals/cats.json", "cats", None)],
    "Name a pizza topping": [("foods/pizzaToppings.json", None, None)],
    "Name a cocktail": [("foods/iba_cocktails.json", None, None)],
    "Name a sauce or condiment": [("foods/condiments.json", None, None)],
    "Name a type of bread": [("foods/breads_and_pastries.json", ["breads", "pastries"], None)],
    "Name a body part": [("humans/bodyParts.json", None, None)],
    "Name a famous author": [("humans/authors.json", None, None)],
    "Name a sea creature": [("foods/fish.json", None, None)],
    "Name a TV show": [("film-tv/tv_shows.json", None, None)],
    "Name a singer or band": [("music/rock_hall_of_fame.json", None, "name")],
})


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


def billboard_tail():
    """Every act that charted on the Billboard Hot 100 (1958-now), popularity = weeks charted."""
    path = os.path.join(SOURCES, "billboard.csv")
    if not os.path.exists(path):
        return []
    feat = re.compile(r"\s+(?:Featuring|Feat\.?|Ft\.?|With|Duet With|x|X|Vs\.?)\s+", re.I)
    weeks = collections.Counter()
    for r in csv.DictReader(open(path, encoding="utf8")):
        for part in feat.split(r["performer"]):
            weeks[part.strip()] += 1
    out = []
    for name, w in weeks.items():
        if not name or re.match(r"^(his|her|their|the) (orchestra|band|chorus)", name, re.I):
            continue
        if re.search(r" & |, | And ", name) and w < 60:  # one-off collabs; real duos chart a lot
            continue
        out.append(([name], 0.6 + 1.1 * math.log10(w + 1)))
    return out


def language_tail():
    path = os.path.join(SOURCES, "languages.csv")
    if not os.path.exists(path):
        return []
    out = []
    for r in csv.DictReader(open(path, encoding="utf8")):
        for name in re.split(r";\s*", r["English"]):
            name = re.sub(r"\s*\(.*?\)", "", name).strip()
            if name and "languages" not in name.lower() and len(name) < 30:
                parts = [p.strip() for p in name.split(",")]
                disp = " ".join(reversed(parts)) if len(parts) == 2 else name  # "Greek, Ancient" -> "Ancient Greek"
                out.append(([disp], freq(disp)))
    return out


BOOST = {
    "Name a singer or band": (25, """billie eilish, olivia rodrigo, sabrina carpenter, dua lipa, the weeknd, sza, doja cat, chappell roan, bad bunny,
        post malone, lewis capaldi, sam smith, raye, central cee, stormzy, morgan wallen, kendrick lamar, travis scott, lizzo, miley cyrus,
        selena gomez, charli xcx, tate mcrae, benson boone, noah kahan, zach bryan, hozier, gracie abrams, karol g, peso pluma, tyla""".replace("\n", " ").split(", ")),
}

CUSTOM = {
    "Name a singer or band": (billboard_tail, 450, 0.18),   # (loader, promote top N to ranked list, tail mass)
    "Name a language": (language_tail, 0, 0.10),
}


def build(q, text):
    seen = set()
    head = parse_hand(text, seen)
    if q in EXTEND:
        head += parse_hand(EXTEND[q], seen)
    if q in BOOST:  # move current names up the ranking
        at, names = BOOST[q]
        keys = [norm(n) for n in names]
        moved = [h for k in keys for h in head if norm(h[0]) == k]
        head = [h for h in head if h not in moved]
        head[at:at] = moved
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
                if k and k not in seen and zipf_frequency(n, "en") < 4.2:
                    seen.add(k)
                    tail.append(([n], freq(n)))
    promote, mass = 0, 0.12
    if q in CUSTOM:
        loader, promote, mass = CUSTOM[q]
        for names, z in loader():
            k = norm(names[0])
            if k and k not in seen:
                seen.add(k)
                tail.append((names, z))
    return score(head, tail, tail_mass=mass, promote=promote)


if __name__ == "__main__":
    prompts = [{"q": q, "answers": build(q, text)} for q, text in PROMPTS.items()]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf8") as f:
        json.dump({"version": 2, "pack": "classic", "prompts": prompts}, f, separators=(",", ":"), ensure_ascii=False)
    total = sum(len(p["answers"]) for p in prompts)
    print(f"classic: {len(prompts)} prompts, {total} answers -> {OUT} ({os.path.getsize(OUT)//1024} KB)")
