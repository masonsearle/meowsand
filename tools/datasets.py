"""Big open datasets -> long lists of valid answers with a popularity score z
(roughly log10 scale, higher = more commonly said). All files live in ../sources
(see fetch_sources.sh)."""
import collections, csv, math, os, re
from wordfreq import zipf_frequency

SOURCES = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "sources")
src = lambda f: os.path.join(SOURCES, f)
have = lambda f: os.path.exists(src(f))
clean = lambda s: re.sub(r"\s*\(.*?\)\s*", " ", s).strip()


def video_games():
    if not have("vgsales.csv"):
        return []
    sales = collections.Counter()
    for r in csv.DictReader(open(src("vgsales.csv"), encoding="utf8")):
        try:
            sales[clean(r["Name"])] += float(r["Global_Sales"])
        except ValueError:
            pass
    return [([n], 1.5 + math.log10(s + 0.05)) for n, s in sales.items() if 1 < len(n) < 60]


def board_games():
    if not have("bgg.csv"):
        return []
    out = []
    for r in csv.DictReader(open(src("bgg.csv"), encoding="utf8")):
        n = clean(r["Name"])
        if 1 < len(n) < 60:
            out.append(([n], math.log10(int(r["Users rated"] or 1) + 1)))
    return out


def _books():
    return list(csv.DictReader(open(src("goodbooks.csv"), encoding="utf8"))) if have("goodbooks.csv") else []


def books():
    out = []
    for r in _books():
        t = (r["original_title"] or r["title"]).strip()
        t = re.sub(r"\s*\(.*?#\d+\)\s*$", "", t)
        if 1 < len(t) < 80:
            out.append(([t], math.log10(int(r["ratings_count"] or 1) + 1)))
    return out


def authors():
    pop = collections.Counter()
    for r in _books():
        for a in r["authors"].split(",")[:1]:
            pop[a.strip()] += int(r["ratings_count"] or 0)
    return [([a], math.log10(n + 1)) for a, n in pop.items() if a]


def pokemon():
    if not have("pokemon_species.csv"):
        return []
    names = {}
    if have("pokemon_names.csv"):
        for r in csv.DictReader(open(src("pokemon_names.csv"), encoding="utf8")):
            if r["local_language_id"] == "9":
                names[r["pokemon_species_id"]] = r["name"]
    out = []
    for r in csv.DictReader(open(src("pokemon_species.csv"), encoding="utf8")):
        n = names.get(r["id"], r["identifier"].replace("-", " "))
        out.append(([n], 4.5 - 0.35 * int(r["generation_id"]) + (0.1 if r["is_legendary"] == "1" else 0)))
    return out


COLOUR_WORDS = set("""red blue green yellow purple orange pink black white brown grey gray violet indigo gold golden silver teal cyan magenta
lavender lilac cream crimson scarlet burgundy olive lime emerald peach coral salmon mint khaki tan charcoal ivory amber aqua mauve
fuchsia ochre sepia navy maroon beige turquoise azure cobalt jade ruby sapphire plum rose rust copper bronze""".split())


def colours():
    if not have("colornames.csv"):
        return []
    out = []
    for r in csv.DictReader(open(src("colornames.csv"), encoding="utf8")):
        n = r["name"]
        if r.get("good name") != "x" or len(n) > 30 or len(n.split()) > 2:
            continue
        words = n.lower().split()
        colourish = any(w in COLOUR_WORDS for w in words)
        if colourish or (len(words) == 1 and zipf_frequency(n, "en") < 3.2):
            out.append(([n], 1.0 + 0.3 * zipf_frequency(n, "en")))
    return out


EUROPE = set("""Albania Andorra Austria Belarus Belgium Bosnia and Herzegovina Bulgaria Croatia Cyprus Czech Republic Czechia Denmark Estonia
Finland France Germany Greece Hungary Iceland Ireland Italy Kosovo Latvia Liechtenstein Lithuania Luxembourg Malta Moldova Monaco
Montenegro Netherlands North Macedonia Macedonia Norway Poland Portugal Romania Russia San Marino Serbia Slovakia Slovenia Spain Sweden
Switzerland Ukraine United Kingdom Vatican""".replace("\n", " ").split(" "))


def _cities():
    return list(csv.DictReader(open(src("worldcities.csv"), encoding="utf8"))) if have("worldcities.csv") else []


def cities(filter_fn=lambda r: True):
    out, seen = [], set()
    for r in _cities():
        n = r["name"]
        if filter_fn(r) and n not in seen and len(n) > 2 and zipf_frequency(n, "en") < 3.8:  # skip towns called "Of", "Time"...
            seen.add(n)
            out.append(([n], 1.0))
    return out


def european_cities():
    multi = {"Bosnia and Herzegovina", "Czech Republic", "North Macedonia", "San Marino", "United Kingdom"}
    return cities(lambda r: r["country"] in EUROPE or r["country"] in multi)


def us_cities():
    return cities(lambda r: r["country"] == "United States")


def english_towns():
    return cities(lambda r: r["country"] == "United Kingdom" and r["subcountry"] == "England")


def world_cities():
    return cities()


def baby_names(sex=None):
    if not have("babynames.csv"):
        return []
    pop = collections.Counter()
    for r in csv.DictReader(open(src("babynames.csv"), encoding="utf8")):
        if sex is None or r["sex"] == sex:
            pop[r["name"]] += float(r["percent"]) * (3 if int(r["year"]) >= 1970 else 1)  # favour names people know today
    return [([n], 5 + math.log10(p)) for n, p in pop.items()]


# ---------- rhymes from the CMU pronouncing dictionary ----------
_CMU = None


def _cmu():
    global _CMU
    if _CMU is None:
        _CMU = collections.defaultdict(list)
        if have("cmudict.dict"):
            for line in open(src("cmudict.dict"), encoding="latin-1"):
                parts = line.split("#")[0].split()
                if len(parts) < 2:
                    continue
                word = re.sub(r"\(\d+\)$", "", parts[0])
                _CMU[word].append(parts[1:])
    return _CMU


def _rhyme_part(phones):
    for i in range(len(phones) - 1, -1, -1):
        if phones[i][-1] in "12":  # last stressed vowel
            return " ".join(p.rstrip("012") for p in phones[i:])
    return None


def rhymes(word):
    d = _cmu()
    targets = {_rhyme_part(p) for p in d.get(word, [])} - {None}
    out = []
    for w, prons in d.items():
        if w == word or not re.fullmatch(r"[a-z]{2,}", w):
            continue
        if any(_rhyme_part(p) in targets for p in prons):
            z = zipf_frequency(w, "en")
            if z >= 1.5:  # real-ish words only
                out.append(([w], z))
    return out


# ---------- songs from the Billboard Hot 100 (1958-now) ----------
_SONGS = None


def _songs():
    global _SONGS
    if _SONGS is None:
        _SONGS = collections.defaultdict(lambda: [0, ""])
        if have("billboard.csv"):
            for r in csv.DictReader(open(src("billboard.csv"), encoding="utf8")):
                t = r["title"].strip()
                e = _SONGS[(t.lower(), r["performer"])]
                e[0] += 1
                e[1] = t
    return _SONGS


def songs(artist=None):
    best = {}
    for (low, perf), (weeks, title) in _songs().items():
        if artist and not re.search(r"(^|\W)" + re.escape(artist) + r"($|\W)", perf, re.I):
            continue
        t = title.title() if title.isupper() else title
        if low not in best or weeks > best[low][1]:
            best[low] = (t, weeks)
    out = []
    for t, w in best.values():
        parts = [x.strip() for x in t.split("/") if x.strip()]  # double A-sides: either title counts
        out.append(((parts + [t]) if len(parts) > 1 else [t], 0.8 + 1.2 * math.log10(w + 1)))
    return out


# ---------- round 4: filtered views of the same datasets ----------
def pokemon_of_type(type_name):
    if not (have("pokemon_types.csv") and have("types.csv")):
        return []
    tid = next((r["id"] for r in csv.DictReader(open(src("types.csv"), encoding="utf8")) if r["identifier"] == type_name), None)
    ids = {r["pokemon_id"] for r in csv.DictReader(open(src("pokemon_types.csv"), encoding="utf8")) if r["type_id"] == tid}
    return [(n, z) for (n, z), pid in _pokemon_with_ids() if pid in ids]


def _pokemon_with_ids():
    names = {}
    if have("pokemon_names.csv"):
        for r in csv.DictReader(open(src("pokemon_names.csv"), encoding="utf8")):
            if r["local_language_id"] == "9":
                names[r["pokemon_species_id"]] = r["name"]
    out = []
    for r in csv.DictReader(open(src("pokemon_species.csv"), encoding="utf8")):
        n = names.get(r["id"], r["identifier"].replace("-", " "))
        out.append((([n], 4.5 - 0.35 * int(r["generation_id"])), r["id"]))
    return out


def video_games_where(genre=None, publisher=None, platforms=None):
    if not have("vgsales.csv"):
        return []
    sales = collections.Counter()
    for r in csv.DictReader(open(src("vgsales.csv"), encoding="utf8")):
        if genre and r["Genre"] != genre:
            continue
        if publisher and publisher not in r["Publisher"]:
            continue
        if platforms and r["Platform"] not in platforms:
            continue
        try:
            sales[clean(r["Name"])] += float(r["Global_Sales"])
        except ValueError:
            pass
    return [([n], 1.5 + math.log10(s + 0.05)) for n, s in sales.items() if 1 < len(n) < 60]


def books_by(author):
    out = []
    for r in _books():
        if author.lower() in r["authors"].lower():
            t = re.sub(r"\s*\(.*?#\d+\)\s*$", "", (r["original_title"] or r["title"]).strip())
            if 1 < len(t) < 80:
                out.append(([t], math.log10(int(r["ratings_count"] or 1) + 1)))
    return out


def cities_in(country, subcountry=None):
    return cities(lambda r: r["country"] == country and (subcountry is None or r["subcountry"] == subcountry))


def palindromes():
    from wordfreq import top_n_list
    out = []
    for w in top_n_list("en", 300000):
        if len(w) >= 3 and w.isalpha() and w == w[::-1] and len(set(w)) > 1 and re.search("[aeiouy]", w) and w in _cmu() and zipf_frequency(w, "en") >= 1.8:
            out.append(([w], zipf_frequency(w, "en")))
    return out
