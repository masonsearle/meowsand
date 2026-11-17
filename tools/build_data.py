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
from rarity import norm, freq, parse_hand, score, MAX_N
from wordfreq import zipf_frequency
from categories import HANDWRITTEN, CORPORA
from categories_more import MORE
from categories_extend import EXTEND, NEW
from includes import INCLUDES
import datasets as D
try:
    from categories_extend2 import EXTEND2
except ImportError:
    EXTEND2 = {}

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

SONG_ARTISTS = ["Taylor Swift", "The Beatles", "Drake", "Michael Jackson", "Elvis Presley", "Madonna", "Rihanna", "Elton John",
                "Ed Sheeran", "Beyonce", "Mariah Carey", "Ariana Grande", "Justin Bieber", "Eminem", "Lady Gaga", "Katy Perry",
                "Bruno Mars", "Stevie Wonder", "Whitney Houston", "Prince", "The Weeknd", "Queen", "The Rolling Stones", "Britney Spears"]

CUSTOM = {  # prompt: (loader, promote top N by popularity into the ranked list, unused)
    "Name a singer or band": (billboard_tail, 450, 0.18),
    "Name a language": (language_tail, 0, 0.10),
    "Name a video game": (D.video_games, 150, 0),
    "Name a board game": (D.board_games, 120, 0),
    "Name a famous author": (D.authors, 150, 0),
    "Name a Pokémon": (D.pokemon, 0, 0),
    "Name a colour": (D.colours, 0, 0),
    "Name a European city": (D.european_cities, 0, 0),
    "Name a US city": (D.us_cities, 0, 0),
    "Name an English town or city": (D.english_towns, 0, 0),
    "Name a city": (D.world_cities, 0, 0),
    "Name a good name for a cat": (D.baby_names, 0, 0),
    "Name a word that rhymes with cat": (lambda: D.rhymes("cat"), 0, 0),
    "Name a word that rhymes with day": (lambda: D.rhymes("day"), 60, 0),
    "Name a word that rhymes with light": (lambda: D.rhymes("light"), 60, 0),
    "Name a word that rhymes with bee": (lambda: D.rhymes("bee"), 60, 0),
    "Name a word that rhymes with blue": (lambda: D.rhymes("blue"), 60, 0),
    "Name a word that rhymes with mouse": (lambda: D.rhymes("mouse"), 30, 0),
    "Name a song": (D.songs, 400, 0),
    "Name a book": (D.books, 300, 0),
    "Name a boy's name": (lambda: D.baby_names("boy"), 300, 0),
    "Name a girl's name": (lambda: D.baby_names("girl"), 300, 0),
}
for _a in SONG_ARTISTS:
    CUSTOM[f"Name a song by {_a}"] = ((lambda a=_a: D.songs(a)), 25, 0)
    PROMPTS.setdefault(f"Name a song by {_a}", "")
for _q in ["Name a song", "Name a book", "Name a boy's name", "Name a girl's name", "Name a city",
           "Name a word that rhymes with day", "Name a word that rhymes with light", "Name a word that rhymes with bee",
           "Name a word that rhymes with blue", "Name a word that rhymes with mouse"]:
    PROMPTS.setdefault(_q, "")
PROMPTS["Name a song"] = """bohemian rhapsody, happy birthday, wonderwall, thriller, billie jean, hey jude, yesterday, imagine, let it be, shake it off,
sweet caroline, mr brightside, don't stop believin', hotel california, stairway to heaven, smells like teen spirit, like a prayer,
dancing queen, i will always love you, all i want for christmas is you, last christmas, jingle bells, blinding lights, shape of you,
uptown funk, rolling in the deep, someone like you, hello, bad guy, as it was, anti-hero, flowers, despacito, gangnam style,
baby, umbrella, single ladies, crazy in love, halo, toxic, oops i did it again, baby one more time, wannabe, my heart will go on,
purple rain, born to run, livin' on a prayer, sweet child o' mine, we will rock you, we are the champions, don't stop me now,
another one bites the dust, under pressure, heroes, space oddity, rocket man, your song, tiny dancer, i'm still standing,
yellow, fix you, viva la vida, africa, take on me, never gonna give you up, ymca, macarena, dancing on my own, rather be,
see you again, old town road, levitating, espresso, good 4 u, drivers license, watermelon sugar, perfect, thinking out loud,
lose control, a bar song, cruel summer, love story, blank space, happy, get lucky, call me maybe, poker face, bad romance,
firework, roar, teenage dream, wrecking ball, hips don't lie, waka waka, rehab, valerie, back to black, hallelujah, bridge over troubled water,
yesterday, here comes the sun, i want to hold your hand, satisfaction, paint it black, respect, i will survive, stayin' alive,
superstition, what a wonderful world, my way, fly me to the moon, jolene, 9 to 5, take me home country roads, ring of fire,
hound dog, jailhouse rock, can't help falling in love, suspicious minds, johnny b. goode, la bamba, twist and shout, stand by me,
lean on me, ain't no mountain high enough, my girl, i heard it through the grapevine, let's stay together, no woman no cry,
one love, three little birds, redemption song, smooth, wonderful tonight, layla, creep, karma police, champagne supernova,
don't look back in anger, song 2, parklife, common people, chasing cars, angels, rock dj, toxic, mambo no. 5, barbie girl"""
PROMPTS["Name a city"] = """london, paris, new york, tokyo, rome, los angeles, dubai, barcelona, sydney, berlin, madrid, amsterdam, chicago, las vegas,
miami, san francisco, hong kong, singapore, bangkok, istanbul, moscow, beijing, shanghai, mumbai, delhi, rio de janeiro, cairo, toronto,
vancouver, dublin, edinburgh, manchester, liverpool, venice, florence, milan, prague, vienna, budapest, lisbon, athens, seoul, mexico city,
buenos aires, cape town, melbourne, boston, seattle, washington, birmingham, glasgow, leeds, bristol, copenhagen, stockholm, oslo"""


def build(q, text, base=None):
    seen = set()
    head = parse_hand(text, seen)
    if q in EXTEND:
        head += parse_hand(EXTEND[q], seen)
    if q in EXTEND2:
        head += parse_hand(EXTEND2[q], seen)
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
            if not names or not names[0]:
                continue
            k = norm(names[0])
            if k and k not in seen:
                seen.add(k)
                tail.append((names, z))
    own = score(head, tail, tail_mass=mass, promote=promote)
    if base is None or q not in INCLUDES:
        return own
    # "technically true" answers borrowed from other prompts, each category weighted by how
    # often players would reach for it; inside a category, keep the source's popularity order
    seen = {k for a in own for k in a.get("k", [norm(a["a"])])}
    rows = [(a, 1 / a["n"]) for a in own]
    for src, flt, w in INCLUDES[q]:
        if src not in base:
            print("  include: unknown prompt", src)
            continue
        pool = base[src]
        if flt and flt[0] == "only":
            byk = {k: a for a in pool for k in a.get("k", [norm(a["a"])])}
            picked = []
            for names in parse_hand(flt[1]):
                a = next((byk[norm(x)] for x in names if norm(x) in byk), None)
                picked.append({"a": a["a"], "k": sorted(set(a.get("k", [norm(a["a"])]) + [norm(x) for x in names])), "n": a["n"]} if a
                              else {"a": names[0], "k": sorted({norm(x) for x in names}), "n": 5000})
        elif flt and flt[0] == "top":  # only the best-known N of a huge list
            picked = pool[:flt[1]]
        else:
            deny = {norm(x) for names in parse_hand(flt[1]) for x in names} if flt else set()
            picked = [a for a in pool if not (set(a.get("k", [norm(a["a"])])) & deny)]
        tot = sum(1 / a["n"] for a in picked) or 1
        for a in picked:
            keys = set(a.get("k", [norm(a["a"])]))
            if keys & seen:
                continue
            seen |= keys
            rows.append(({"a": a["a"], "k": sorted(keys)}, w * (1 / a["n"]) / tot))
    total = sum(sh for _, sh in rows)
    out = []
    for a, sh in rows:
        e = {"a": a["a"], "n": int(min(MAX_N, max(2, round(total / sh))))}
        if a.get("k") and a["k"] != [norm(a["a"])]:
            e["k"] = a["k"]
        out.append(e)
    return sorted(out, key=lambda e: e["n"])


if __name__ == "__main__":
    base = {q: build(q, text) for q, text in PROMPTS.items()}          # phase 1: each prompt on its own
    prompts = [{"q": q, "answers": build(q, text, base) if q in INCLUDES else base[q]} for q, text in PROMPTS.items()]  # phase 2
    from rarity import write_pack
    write_pack(os.path.join(ROOT, "data", "classic"), "classic", prompts)
