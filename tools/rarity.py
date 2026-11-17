"""Shared helpers: normalising answers and turning lists into "1 in N" rarity."""
import re, unicodedata
from wordfreq import zipf_frequency

MAX_N = 250_000


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]", "", s)
    s = re.sub(r"^the ", "", re.sub(r"\s+", " ", s).strip())
    return s.strip()


def freq(name):
    z = zipf_frequency(name, "en")
    if z == 0:
        z = max(0.0, zipf_frequency(name.split()[-1], "en") - 2.5)
    return max(z, 0.5)


def parse_hand(text, seen=None):
    """'a|b, c, d' -> [['a','b'], ['c'], ['d']] skipping anything already in `seen`."""
    seen = set() if seen is None else seen
    items = []
    for raw in re.split(r"[,\n]", text):
        names = [x.strip() for x in raw.strip().split("|") if x.strip()]
        if not names:
            continue
        keys = {norm(n) for n in names} - {""}
        if not keys or keys & seen:
            continue
        seen |= keys
        items.append(names)
    return items


def score(head, tail=(), tail_mass=0.12, head_wordfreq=True, promote=0):
    """head: ordered list of [display, alias...] (most common first).
    tail: list of ([display, alias...], z) where z is a popularity score on a
    roughly log10 scale (wordfreq zipf works). Returns sorted answer dicts."""
    tail = sorted(tail, key=lambda e: (-e[1], e[0][0]))
    if promote:
        head = list(head) + [names for names, _ in tail[:promote]]
        tail = tail[promote:]
    def curve(i):  # Zipf-like: steep for the obvious top 150, flatter after (long, flat tails)
        return (i + 2) ** -1.25 if i < 150 else 152 ** -1.25 * ((i + 2) / 152) ** -0.9

    hw, ff = [], []
    for i, names in enumerate(head):
        f = ((10 ** (0.8 * freq(names[0]))) / 1e4) ** 0.3 if head_wordfreq else 1.0
        ff.append(f)
        hw.append(curve(i) ** 0.7 * f if head_wordfreq else curve(i))
    # tail = continuation of the ranking, ordered by popularity z, without beating the ranked list
    tail_f = sorted(ff)[len(ff) // 4] if ff and head_wordfreq else 1.0
    tw = [(curve(len(head) + j) ** 0.7 if head_wordfreq else curve(len(head) + j)) * tail_f for j in range(len(tail))]
    total = sum(hw) + sum(tw)
    rows = [(n, w / total) for n, w in zip(head, hw)]
    floor = min(s for _, s in rows) if rows else 1
    rows += [(n, min(floor, w / total)) for (n, _), w in zip(tail, tw)]
    out = []
    for names, share in rows:
        out.append({
            "a": names[0].lower(),
            "k": sorted({norm(x) for x in names if norm(x)}),
            "n": int(min(MAX_N, max(2, round(1 / share)))),
        })
    out.sort(key=lambda e: e["n"])
    for e in out:  # save space: keys default to norm(display) in the game
        if e["k"] == [norm(e["a"])]:
            del e["k"]
    return out


def write_pack(folder, pack, prompts):
    """One small file per prompt + an index, so the game only downloads the prompts it plays."""
    import json, os, glob
    os.makedirs(folder, exist_ok=True)
    for old in glob.glob(os.path.join(folder, "*.json")):
        os.remove(old)
    index = {"version": 3, "pack": pack, "total": sum(len(p["answers"]) for p in prompts),
             "prompts": [{"q": p["q"], "n": len(p["answers"])} for p in prompts]}
    for i, p in enumerate(prompts):
        with open(os.path.join(folder, f"{i}.json"), "w", encoding="utf8") as f:
            json.dump(p, f, separators=(",", ":"), ensure_ascii=False)
    with open(os.path.join(folder, "index.json"), "w", encoding="utf8") as f:
        json.dump(index, f, separators=(",", ":"), ensure_ascii=False)
    size = sum(os.path.getsize(x) for x in glob.glob(os.path.join(folder, "*.json")))
    print(f"{pack}: {len(prompts)} prompts, {index['total']} answers -> {folder}/ ({size // 1024} KB total, "
          f"biggest prompt {max(os.path.getsize(x) for x in glob.glob(os.path.join(folder, '*.json'))) // 1024} KB)")
