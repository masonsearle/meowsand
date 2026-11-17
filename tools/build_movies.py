"""Builds data/movies.json (the Movies pack).

  bash tools/fetch_sources.sh     # once
  python tools/build_movies.py

Answers come from ~36k films in the Wikipedia film dataset (title, year, cast,
genres). Popularity: IMDb vote counts where we have them (vega-datasets),
otherwise a proxy from article length / poster / era. Hand-ordered heads in
movies_heads.py make sure the famous answers rank as common.
"""
import collections, json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from rarity import norm, parse_hand, score
from movies_heads import HEADS, CLOSED, ACTORS
from categories import HANDWRITTEN
from franchises import FRANCHISES
from movies_more import ACTORS_MORE, GENRES_MORE, CLOSED_MORE, SHARE_WITH_CLASSIC

ROOT = os.path.dirname(HERE)
SOURCES = os.path.join(ROOT, "..", "sources")
OUT = os.path.join(ROOT, "data", "movies.json")

wiki = json.load(open(os.path.join(SOURCES, "wiki_movies.json"), encoding="utf8"))
vega = json.load(open(os.path.join(SOURCES, "vega_movies.json"), encoding="utf8"))

votes = {}
for v in vega:
    t = norm(str(v.get("Title") or ""))
    if t and v.get("IMDB Votes"):
        votes[t] = max(votes.get(t, 0), v["IMDB Votes"])


def pop(f):
    v = votes.get(norm(f["title"]))
    if v:
        return math.log10(v + 10)
    era = 0.6 if f["year"] >= 2000 else 0.4 if f["year"] >= 1980 else 0.2 if f["year"] >= 1960 else 0
    return 1.2 + (0.4 if f.get("thumbnail") else 0) + min(len(f.get("extract") or ""), 2500) / 2500 * 0.9 + era


FILMS = []
for f in wiki:
    if not f.get("title") or f["year"] < 1930:  # skip the silent era: valid but nobody says them
        continue
    f["z"] = pop(f)
    f["text"] = (f.get("extract") or "").lower()
    FILMS.append(f)


def names_for(title):
    names = [title]
    if ":" in title:
        pre = title.split(":")[0].strip()
        if len(pre) >= 4:
            names.append(pre)
    return names


def film_tail(pred):
    best = {}
    for f in FILMS:
        if pred(f):
            k = norm(f["title"])
            if k and (k not in best or f["z"] > best[k]["z"]):
                best[k] = f
    return [(names_for(f["title"]), f["z"]) for f in best.values()]


def genre(*gs):
    gs = set(gs)
    return lambda f: bool(gs & set(f.get("genres", [])))


def decade(start):
    return lambda f: start <= f["year"] < start + 10


def title_re(rx):
    r = re.compile(rx, re.I)
    return lambda f: bool(r.search(f["title"]))


def text_re(rx):
    r = re.compile(rx, re.I)
    return lambda f: bool(r.search(f["text"]))


NUM = r"\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|twenty|hundred|thousand|million|first|second|third|half)\b"
COL = r"\b(red|blue|green|yellow|black|white|pink|purple|orange|gold|golden|silver|grey|gray|brown|scarlet|crimson|violet|indigo|lavender)\b"
ANIMALS = sorted({k for k in [norm(a.split("|")[0]) for a in re.split(r"[,\n]", HANDWRITTEN["Name an animal"])] if k and " " not in k and len(k) >= 3}
                 - {"seal", "crane", "fly", "bat", "mole", "kid", "ram", "swift", "robin", "ant", "bee", "duck", "cat", "dog"})
ANIMAL = r"\b(" + "|".join(ANIMALS + ["cats?", "dogs?", "ducks?", "bees?"]) + r")s?\b"

PROMPTS = [  # (prompt, filter, promote-by-popularity)
    ("Name a horror movie", genre("Horror", "Slasher", "Supernatural"), 80),
    ("Name a comedy movie", genre("Comedy"), 80),
    ("Name an action movie", genre("Action"), 80),
    ("Name a sci-fi movie", genre("Science Fiction"), 60),
    ("Name an animated movie", genre("Animated"), 40),
    ("Name a romantic movie", genre("Romance"), 60),
    ("Name a superhero movie", genre("Superhero"), 20),
    ("Name a western", genre("Western"), 40),
    ("Name a war movie", genre("War"), 50),
    ("Name a musical", genre("Musical"), 40),
    ("Name a sports movie", genre("Sports", "Sport"), 40),
    ("Name a thriller", genre("Thriller", "Suspense"), 80),
    ("Name a fantasy movie", genre("Fantasy"), 50),
    ("Name a crime or gangster movie", genre("Crime"), 60),
    ("Name a disaster movie", genre("Disaster"), 20),
    ("Name a spy movie", genre("Spy"), 30),
    ("Name a teen movie", genre("Teen"), 30),
    ("Name a family movie", genre("Family"), 40),
    ("Name a biopic", genre("Biography"), 50),
    ("Name a martial arts movie", genre("Martial Arts"), 20),
    ("Name a mystery movie", genre("Mystery"), 40),
    ("Name a movie from the 70s", decade(1970), 150),
    ("Name a movie from the 80s", decade(1980), 150),
    ("Name a movie from the 90s", decade(1990), 150),
    ("Name a movie from the 2000s", decade(2000), 150),
    ("Name a movie from the 2010s", decade(2010), 60),
    ("Name a movie from the 2020s", decade(2020), 30),
    ("Name a movie with a number in its title", title_re(NUM), 120),
    ("Name a movie with a colour in its title", title_re(COL), 80),
    ("Name a movie with an animal in its title", title_re(ANIMAL), 80),
    ("Name a movie with 'love' in its title", title_re(r"\blove"), 60),
    ("Name a movie with 'man' in its title", title_re(r"\bman\b|\bmen\b"), 80),
    ("Name a movie with 'night' in its title", title_re(r"\bnights?\b"), 60),
    ("Name a Christmas movie", lambda f: bool(re.search(r"christmas|santa|xmas|grinch|scrooge", f["title"] + " " + f["text"][:400], re.I)), 60),
    ("Name a movie sequel", lambda f: bool(re.search(r"\b(2|3|4|5|6|7|ii|iii|iv|part \w+|returns|strikes back|reloaded|revolutions|resurrection)\b", f["title"], re.I) or "sequel to" in f["text"]), 120),
    ("Name a movie based on a book", text_re(r"based on (the|a|an) (\d{4} )?([\w'-]+ ){0,3}(novel|book|memoir|novella|short story)"), 120),
    ("Name a movie with a dog in it", lambda f: bool(re.search(r"\bdogs?\b|\bpuppy|\bpuppies", f["title"] + " " + f["text"], re.I)), 60),
    ("Name a one-word movie title", lambda f: " " not in norm(f["title"]) and len(norm(f["title"])) >= 3, 200),
    ("Name a movie", lambda f: True, 100),
]
EXTRA_HEADS = {
    "Name a movie with a number in its title": "101 dalmatians, 21 jump street, 300, se7en|seven, 2001 a space odyssey, 12 angry men, 10 things i hate about you, 28 days later, ocean's eleven, 13 going on 30, 50 first dates, 1917, the sixth sense, the fifth element, 127 hours, 12 years a slave, 3 idiots, the 40-year-old virgin, 8 mile, 22 jump street, 9 to 5, 2012, 17 again, 21, 23, 1408, 500 days of summer, 47 ronin, 10 cloverfield lane, 3:10 to yuma, the hateful eight, apollo 13, district 9, four weddings and a funeral, two weeks notice, the three musketeers, seven pounds, ocean's 8, 6 underground, the 6th day, the 13th warrior, 8 mm, 28 weeks later, 1984, 2 fast 2 furious, toy story 2, shrek 2, iron man 2, the hangover part ii",
    "Name a movie with a colour in its title": "the green mile, black panther, pretty in pink, the color purple, blue velvet, a clockwork orange, the pink panther, black swan, reservoir dogs? , red, the green knight, men in black, black widow, the green hornet, red notice, blue beetle, red sparrow, the red shoes, red dawn, white chicks, snow white, the black phone, the white lotus, black hawk down, green book, orange county, the gold rush, goldfinger, goldeneye, silver linings playbook, the man with the golden gun, blue is the warmest colour, red heat, the thin red line, black christmas, white christmas, the blue lagoon, blue crush, mr. brown, the hunt for red october, black mass, white house down, the grey, fifty shades of grey, purple rain, green lantern, a white wedding",
    "Name a movie with an animal in its title": "the lion king, the silence of the lambs, reservoir dogs, the wolf of wall street, black swan, snakes on a plane, fantastic mr. fox, chicken run, kung fu panda, the birds, jaws? , planet of the apes, the eagle has landed, the deer hunter, babe, legally blonde? , the bear, the fox and the hound, bee movie, the jungle book? , isle of dogs, cats, the shaggy dog, white chicks, flushed away? , ratatouille? , the mighty ducks, cat on a hot tin roof, one flew over the cuckoo's nest, to kill a mockingbird, the pelican brief, top cat, the pink panther, the black stallion, war horse, the horse whisperer, free willy? , the lobster, the lion witch and the wardrobe, a bug's life, spider-man, batman, ant-man, the wolfman, the scorpion king, the fly, monkey man, cocaine bear, the beekeeper, the hunger games? , kung fu panda",
}
for k, v in EXTRA_HEADS.items():
    HEADS.setdefault(k, re.sub(r"[^,]*\? ,?", "", v))


def actor_prompt(name):
    a_films = film_tail(lambda f: name in f.get("cast", []) and f["year"] >= 1955)
    return f"Name a movie starring {name}", a_films


def people_tail():
    count, vsum = collections.Counter(), collections.Counter()
    for f in FILMS:
        if f["year"] < 1950:
            continue
        v = votes.get(norm(f["title"]), 0)
        for a in f.get("cast", [])[:6]:
            count[a] += 1
            vsum[a] += v
    out = []
    for a, c in count.items():
        if c >= 4 and 3 <= len(a) < 40:
            out.append(([a], 0.7 * math.log10(vsum[a] + 10) + 0.8 * math.log10(c)))
    return out


def director_tail():
    vs = collections.Counter()
    for v in vega:
        d = v.get("Director")
        if d:
            vs[d] += v.get("IMDB Votes") or 0
    return [([d], math.log10(n + 10)) for d, n in vs.items()]


def build_one(q, head_text, tail, promote):
    seen = set()
    head = parse_hand(head_text, seen) if head_text else []
    t = [(names, z) for names, z in tail if norm(names[0]) not in seen]
    uniq, ks = [], set()
    for names, z in sorted(t, key=lambda e: -e[1]):
        k = norm(names[0])
        if k and k not in ks:
            ks.add(k)
            uniq.append((names, z))
    if not head and not promote:
        promote = 50
    return {"q": q, "answers": score(head, uniq, head_wordfreq=False, promote=promote)}


ACTORS.update(ACTORS_MORE)
CLOSED.update(CLOSED_MORE)
_extra = []
for q, tags, promote, head in GENRES_MORE:
    pred = decade(1900 + int(q[-3:-1])) if tags is None else genre(*tags)
    HEADS[q] = head
    _extra.append((q, pred, promote))
PROMPTS[-1:-1] = _extra  # keep "Name a movie" last

# ---- round 5: genre x decade, more actors, title words ----
GENRE_DECADE = [("horror movie", ("Horror", "Slasher", "Supernatural"), "Name a horror movie"), ("comedy", ("Comedy",), "Name a comedy movie"),
                ("action movie", ("Action",), "Name an action movie"), ("sci-fi movie", ("Science Fiction",), "Name a sci-fi movie"),
                ("animated movie", ("Animated",), "Name an animated movie"), ("romantic movie", ("Romance",), "Name a romantic movie"),
                ("thriller", ("Thriller", "Suspense"), "Name a thriller"), ("war movie", ("War",), "Name a war movie"),
                ("fantasy movie", ("Fantasy",), "Name a fantasy movie"), ("crime movie", ("Crime",), "Name a crime or gangster movie"),
                ("family movie", ("Family",), "Name a family movie"), ("musical", ("Musical",), "Name a musical"),
                ("western", ("Western",), "Name a western"), ("teen movie", ("Teen",), "Name a teen movie"),
                ("superhero movie", ("Superhero",), "Name a superhero movie"), ("sports movie", ("Sports", "Sport"), "Name a sports movie")]
by_title = {}
for f in FILMS:
    by_title.setdefault(norm(f["title"]), []).append((f["year"], set(f.get("genres", []))))
def head_in_decade(head_q, d0, tags):
    keep = []
    for names in parse_hand(HEADS.get(head_q, "")):
        hits = [(y, g) for x in names for (y, g) in by_title.get(norm(x), [])]
        # that decade's film with this title must itself be in the genre (no remakes / same-name films)
        if any(d0 <= y < d0 + 10 and (g & set(tags)) for y, g in hits):
            keep.append("|".join(names))
    return ", ".join(keep)
gd = []
for label, tags, head_q, in GENRE_DECADE:
    for d0 in (1970, 1980, 1990, 2000, 2010):
        q = f"Name a{'n' if label[0] in 'aeiou' else ''} {label} from the {str(d0)[2:]}s"
        pred = (lambda f, t=set(tags), a=d0: a <= f["year"] < a + 10 and bool(t & set(f.get("genres", []))))
        if sum(1 for f in FILMS if pred(f)) >= 25:
            HEADS[q] = head_in_decade(head_q, d0, tags)
            gd.append((q, pred, 40))
TITLE_WORDS = ["dead", "girl", "king", "war", "star", "house", "day", "christmas", "blood", "death", "black", "life", "time", "home",
               "world", "dog", "boy", "city", "dark", "story", "secret", "big", "american", "lost", "last", "little", "great", "baby"]
for w in TITLE_WORDS:
    q = f"Name a movie with '{w}' in its title"
    if not any(q == x[0] for x in PROMPTS):
        gd.append((q, title_re(r"\b" + w + r"s?\b"), 80))
PROMPTS[-1:-1] = gd

# more actors, picked by how well-known their films are; their best-known films lead
_vs, _cnt = collections.Counter(), collections.Counter()
for f in FILMS:
    if f["year"] >= 1965:
        for a in f.get("cast", [])[:5]:
            _cnt[a] += 1
            _vs[a] += votes.get(norm(f["title"]), 0)
SKIP_ACTORS = {"Scott Glenn", "Ving Rhames", "Djimon Hounsou", "Chris Cooper", "Sean Astin", "Jason Lee", "Aaron Eckhart", "Daryl Hannah",
               "Brian Cox", "Stellan Skarsgård", "Seann William Scott", "Ed Harris", "Tim Robbins", "John Hurt", "Guy Pearce", "Clive Owen",
               "Jennifer Connelly", "Laurence Fishburne", "Tommy Lee Jones? "}
AUTO_ACTORS = [a for a, v in _vs.most_common(450) if _cnt[a] >= 18 and a not in ACTORS and a not in SKIP_ACTORS][:60]
for a in AUTO_ACTORS:
    ACTORS[a] = ""

# "Name a movie": interleave every hand-ordered head so modern hits rank properly
lists = [parse_hand(HEADS[q]) for q in HEADS if q.startswith("Name a") and "actor" not in q and "director" not in q]
lists += [parse_hand(v) for v in ACTORS.values()]
TOP = """titanic, the godfather, star wars, the shawshank redemption, avatar, jaws, the lion king, frozen, harry potter, toy story,
the dark knight, pulp fiction, forrest gump, jurassic park, back to the future, the matrix, e.t., home alone, inception, barbie,
oppenheimer, finding nemo, shrek, rocky, grease, the wizard of oz, gone with the wind, casablanca, avengers endgame, top gun,
die hard, the lord of the rings, gladiator, the avengers, mean girls, fight club, goodfellas, the notebook, interstellar,
the hunger games, twilight, mamma mia!, the greatest showman, la la land, the exorcist, the shining, psycho, scream, it, up,
ghostbusters, the terminator, alien, the silence of the lambs, schindler's list, saving private ryan, the sound of music,
mary poppins, the little mermaid, aladdin, beauty and the beast, cinderella, snow white, moana, encanto, coco, inside out,
the incredibles, monsters inc, cars, despicable me, minions, madagascar, ice age, kung fu panda, how to train your dragon,
pirates of the caribbean, spider-man, iron man, black panther, the batman, joker, deadpool, wonder woman, superman, batman,
indiana jones, raiders of the lost ark, james bond, skyfall, mission impossible, john wick, the fast and the furious, transformers,
dune, everything everywhere all at once, parasite, get out, the sixth sense, the truman show, the departed, the wolf of wall street,
titanic, love actually, notting hill, elf, the grinch, the polar express, dirty dancing, pretty woman, ghost, the breakfast club,
ferris bueller's day off, the goonies, gremlins, beetlejuice, edward scissorhands, the nightmare before christmas, matilda, paddington"""
mseen = set()
merged = parse_hand(TOP, mseen)  # the all-time most-named films go first, then every list interleaved
merged += parse_hand(", ".join(FRANCHISES.values()), mseen)  # then famous sequels
for i in range(max(len(l) for l in lists)):
    for l in lists:
        if i < len(l) and not ({norm(x) for x in l[i]} & mseen):
            mseen |= {norm(x) for x in l[i]}
            merged.append(l[i])
HEADS["Name a movie"] = ", ".join("|".join(n) for n in merged)

prompts = []
for q, pred, promote in PROMPTS:
    prompts.append(build_one(q, HEADS.get(q, ""), film_tail(pred), promote))
for name, films in ACTORS.items():
    q, tail = actor_prompt(name)
    prompts.append(build_one(q, films, tail, 0 if films else 12))
for q, text in CLOSED.items():
    tail = []
    if q == "Name a famous film director":
        tail = director_tail()
    prompts.append(build_one(q, text, tail, 0))
prompts.append(build_one("Name a Disney film", HANDWRITTEN["Name a Disney film"], [], 0))
prompts.append(build_one("Name a film actor or actress", HEADS["Name a film actor or actress"], people_tail(), 300))

# famous movie characters: superheroes, wizards and villains are movie characters too
import glob
classic = {}
for f in glob.glob(os.path.join(ROOT, "data", "classic", "*.json")):
    if not f.endswith("index.json"):
        d = json.load(open(f, encoding="utf8"))
        classic[d["q"]] = d["answers"]
for p in prompts:
    if p["q"] == "Name a famous movie character":
        have = {k for a in p["answers"] for k in a.get("k", [norm(a["a"])])}
        extra = parse_hand(CLOSED["Name a famous movie villain"])
        for src in ["Name a superhero", "Name a Harry Potter character", "Name a fictional wizard or witch"]:
            extra += [[a["a"]] + a.get("k", []) for a in classic.get(src, [])]
        head = [[a["a"]] + a.get("k", []) for a in p["answers"]]
        byk = {k: a for a in p["answers"] for k in a.get("k", [norm(a["a"])])}
        tail = []
        for n in extra:
            ks = {norm(x) for x in n} - {""}
            hit = next((byk[k] for k in ks if k in byk), None)
            if hit:  # same character: just learn the extra spellings ("hermione")
                hit["k"] = sorted(set(hit.get("k", [norm(hit["a"])])) | ks)
            else:
                tail.append((n, 1.0))
                for k in ks:
                    byk[k] = {"a": n[0], "k": sorted(ks)}
        head = [[a["a"]] + a.get("k", []) for a in p["answers"]]
        p["answers"] = score(head, tail, head_wordfreq=False)

# sequel autocorrect: "matrix 2" -> The Matrix Reloaded
EXACT, SUFFIX = collections.defaultdict(set), []
for keys, films in FRANCHISES.items():
    names = [norm(k) for k in keys.split("|")]
    for i, film in enumerate([f for f in films.split(",") if f.strip()], 1):
        aliases = {f"{n} {i}" for n in names}
        for alt in film.split("|"):
            t = norm(alt)
            EXACT[t] |= aliases
            if len(t) >= 8:
                SUFFIX.append((" " + t, aliases, names))
n_alias = 0
for p in prompts:
    for a in p["answers"]:
        keys = set(a.get("k", [norm(a["a"])])) | {norm(a["a"])}
        add = set()
        for k in keys:
            add |= EXACT.get(k, set())
            for suf, al, names in SUFFIX:
                if k.endswith(suf) and any(n in k for n in names):  # e.g. "star wars episode v the empire strikes back"
                    add |= al
        add -= keys
        if add:
            a["k"] = sorted(keys | add)
            n_alias += 1
print("sequel aliases attached:", n_alias)

prompts = [p for p in prompts if len(p["answers"]) >= 10]
from rarity import write_pack
write_pack(os.path.join(ROOT, "data", "movies"), "movies", prompts)

# some movie prompts also play in the Classic pack
cdir = os.path.join(ROOT, "data", "classic")
cidx = json.load(open(os.path.join(cdir, "index.json"), encoding="utf8"))
cprompts = [json.load(open(os.path.join(cdir, f"{i}.json"), encoding="utf8")) for i in range(len(cidx["prompts"]))]
have_q = {p["q"] for p in cprompts}
byq = {p["q"]: p for p in prompts}
added = [byq[q] for q in SHARE_WITH_CLASSIC if q in byq and q not in have_q]
missing = [q for q in SHARE_WITH_CLASSIC if q not in byq]
if missing:
    print("  share: not found", missing)
write_pack(cdir, "classic", cprompts + added)
