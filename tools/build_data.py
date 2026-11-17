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
from categories_v4 import V4, INCLUDES_V4
from categories_v5 import V5
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
PROMPTS.update(V4)
PROMPTS.update({k: v for k, v in V5.items() if k not in PROMPTS})
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
SONG_ARTISTS += ["Billie Eilish", "Olivia Rodrigo", "Harry Styles", "Post Malone", "Kanye West", "Nicki Minaj", "Chris Brown", "Usher",
                 "Aretha Franklin", "Bee Gees", "Maroon 5", "Shakira", "Justin Timberlake", "Miley Cyrus", "Selena Gomez", "Cher",
                 "Tina Turner", "Billy Joel", "Morgan Wallen", "SZA", "Lil Wayne", "Jay-Z", "The Supremes", "Sabrina Carpenter",
                 "Coldplay", "Bon Jovi", "Lady Gaga", "Kelly Clarkson", "Dua Lipa", "Doja Cat"]
SONG_ARTISTS = list(dict.fromkeys(SONG_ARTISTS))
DATA_HEADS = {  # hand-ordered tops so the famous answers rank as common
    "Name a city in Spain": "madrid, barcelona, seville, valencia, malaga, bilbao, granada, ibiza, palma, benidorm, alicante, marbella, san sebastian, cordoba, toledo, zaragoza, salamanca, cadiz, santiago de compostela, pamplona, murcia, girona, tenerife? , las palmas, santander, oviedo, valladolid, tarragona, ronda, segovia",
    "Name a city in Italy": "rome, venice, milan, florence, naples, pisa, turin, verona, bologna, genoa, palermo, siena, sorrento, como, bari, catania, lucca, padua, trieste, parma, modena, amalfi, positano, rimini, perugia, assisi, bergamo, lecce, cagliari, syracuse",
    "Name a city in France": "paris, nice, lyon, marseille, bordeaux, toulouse, lille, cannes, strasbourg, nantes, montpellier, avignon, calais, rennes, grenoble, dijon, reims, rouen, le havre, biarritz, monaco? , saint-tropez, chamonix, la rochelle, annecy, orleans, tours, versailles, carcassonne, dunkirk",
    "Name a city in Germany": "berlin, munich, hamburg, frankfurt, cologne, dusseldorf, stuttgart, dortmund, dresden, leipzig, bremen, hanover, nuremberg, heidelberg, bonn, essen, potsdam, freiburg, mannheim, aachen, augsburg, munster, kiel, rostock, wiesbaden, mainz, wolfsburg, bielefeld, karlsruhe, regensburg",
    "Name a city in Japan": "tokyo, kyoto, osaka, hiroshima, nagasaki, yokohama, sapporo, nara, kobe, nagoya, fukuoka, okinawa? , sendai, kawasaki, hakone, nikko, kanazawa, matsumoto, takayama, naha, kagoshima, chiba, saitama, kitakyushu, shizuoka, okayama, niigata, kumamoto, kamakura, beppu",
    "Name a city in Australia": "sydney, melbourne, brisbane, perth, adelaide, canberra, gold coast, darwin, hobart, cairns, newcastle, wollongong, geelong, townsville, alice springs, byron bay, ballarat, bendigo, toowoomba, launceston, sunshine coast, mackay, rockhampton, bundaberg, broome, fremantle, noosa, port macquarie, mildura, albury",
    "Name a city in Canada": "toronto, vancouver, montreal, ottawa, calgary, edmonton, quebec city|quebec, winnipeg, halifax, victoria, niagara falls, banff, whistler, regina, saskatoon, hamilton, london, kitchener, windsor, st john's, fredericton, charlottetown, kelowna, mississauga, kingston, moncton, thunder bay, sudbury, yellowknife, whitehorse",
    "Name a city in India": "delhi|new delhi, mumbai|bombay, bangalore|bengaluru, kolkata|calcutta, chennai|madras, hyderabad, goa? , jaipur, agra, pune, ahmedabad, varanasi, amritsar, lucknow, udaipur, jodhpur, kochi, mysore, chandigarh, surat, kanpur, nagpur, indore, bhopal, patna, shimla, darjeeling, rishikesh, pondicherry, coimbatore",
    "Name a town or city in Scotland": "edinburgh, glasgow, aberdeen, dundee, inverness, stirling, perth, st andrews, fort william, oban, paisley, ayr, falkirk, kilmarnock, dumfries, elgin, motherwell, livingston, east kilbride, cumbernauld, hamilton, greenock, dunfermline, kirkcaldy, portree, aviemore, pitlochry, thurso, wick, peterhead",
    "Name a Mario game": "super mario bros., mario kart, super mario 64, super mario odyssey, super mario galaxy, mario party, super mario world, new super mario bros., mario kart 8, mario kart wii, super mario bros. 3, paper mario, super mario sunshine, super mario 3d world, mario tennis, mario golf, luigi's mansion, super mario maker, mario and luigi, super mario bros. wonder, dr. mario, mario strikers, mario and sonic at the olympic games, super mario rpg, yoshi's island, super mario land, mario kart 64, mario kart ds, mario kart double dash, super mario galaxy 2",
    "Name a racing game": "mario kart, gran turismo, forza horizon, need for speed, forza motorsport, crash team racing, burnout, f1, dirt, colin mcrae rally, sonic and sega all-stars racing, wipeout, ridge racer, the crew, project gotham racing, midnight club, test drive, outrun, f-zero, diddy kong racing, split/second, blur, motorstorm, trackmania, assetto corsa, iracing, rocket league? , excite bike|excitebike, road rash, micro machines",
    "Name a shooter game": "call of duty, fortnite, halo, counter-strike, valorant, apex legends, overwatch, battlefield, doom, destiny, team fortress 2, rainbow six siege, borderlands, far cry, bioshock, half-life, goldeneye 007, gears of war, titanfall, pubg|playerunknown's battlegrounds, warzone, left 4 dead, quake, wolfenstein, metro 2033, splatoon, killzone, resistance, crysis, medal of honor, duck hunt, time crisis, house of the dead, ghost recon, the division, escape from tarkov, star wars battlefront, payday, max payne, unreal tournament",
    "Name a fighting game": "street fighter, mortal kombat, tekken, super smash bros., soulcalibur, dragon ball fighterz, injustice, guilty gear, king of fighters, virtua fighter, dead or alive, bloody roar, killer instinct, marvel vs capcom, wwe 2k, ufc, fight night, punch-out!!, multiversus, brawlhalla, naruto storm, def jam fight for ny, power stone, rumble roses, blazblue, skullgirls, tekken 3, street fighter ii, mortal kombat 11, street fighter 6",
    "Name a sports video game": "fifa|ea fc|ea sports fc, wii sports, madden, nba 2k, rocket league, pes|pro evolution soccer, tony hawk's pro skater, fifa 23, fight night, wwe 2k, ufc, mario tennis, mario golf, skate, ssx, nhl, mlb the show, pga tour, tiger woods pga tour, football manager, top spin, virtua tennis, wii fit, golf story, kinect sports, grand slam tennis, f1, olympic games, track and field, punch-out!!",
    "Name a Nintendo game": "mario kart, super mario bros., the legend of zelda|zelda, pokemon, animal crossing, super smash bros., wii sports, donkey kong, kirby, metroid, splatoon, mario party, super mario odyssey, breath of the wild, tears of the kingdom, pikmin, fire emblem, star fox, luigi's mansion, xenoblade chronicles, f-zero, earthbound, wario ware, ring fit adventure, brain training, nintendogs, tetris, duck hunt, punch-out!!, ice climber",
    "Name a PlayStation game": "god of war, the last of us, spider-man|marvel's spider-man, uncharted, gran turismo, crash bandicoot, spyro, ratchet and clank, horizon zero dawn, ghost of tsushima, final fantasy vii, metal gear solid, grand theft auto, resident evil, tekken, little big planet, ico, shadow of the colossus, bloodborne, demon's souls, astro bot, sly cooper, jak and daxter, killzone, infamous, days gone, returnal, death stranding, until dawn, tomb raider, fifa, call of duty, silent hill, medievil, parappa the rapper, tony hawk's pro skater, wipeout, twisted metal, destiny, elden ring",
    "Name a good name for a dog": "max, bella, charlie, luna, buddy, daisy, rocky, molly, bailey, lucy, cooper, coco, teddy, milo, bear, duke, rosie, ruby, alfie, poppy, archie, buster, oscar, toby, winston, rex, bruno, zeus, lola, maggie, sadie, biscuit, scout, ollie, ziggy, pepper, honey, maple, moose, murphy, dexter, jack, sam, sky, shadow, ginger, patch, spot, fido, rover, lassie, scooby, snoopy, pluto, odie, gromit, marley, hachi, nala, simba, loki, thor, odin, apollo, diesel, tank, bolt, chase, marshall, skye, rubble, bingo, bluey, waffles, pickle, nugget, noodle, peanut, bean, sausage, frank, kevin, steve, gary, dave",
}
for _q, _t in DATA_HEADS.items():
    PROMPTS[_q] = re.sub(r"[^,]*\? ?(?=,|$)", "", _t)
for _a in SONG_ARTISTS:
    CUSTOM[f"Name a song by {_a}"] = ((lambda a=_a: D.songs(a)), 25, 0)
    PROMPTS.setdefault(f"Name a song by {_a}", "")
V4_DATA = {
    "Name a fire-type Pokémon": (lambda: D.pokemon_of_type("fire"), "charmander, charizard, charmeleon, vulpix, ninetales, growlithe, arcanine, ponyta, rapidash, magmar, flareon, moltres, cyndaquil, typhlosion, torchic, blaziken, chimchar, infernape, tepig, emboar, fennekin, delphox, litten, incineroar, scorbunny, cinderace"),
    "Name a water-type Pokémon": (lambda: D.pokemon_of_type("water"), "squirtle, blastoise, wartortle, magikarp, gyarados, psyduck, golduck, lapras, vaporeon, totodile, feraligatr, mudkip, swampert, piplup, empoleon, oshawott, froakie, greninja, popplio, primarina, sobble, inteleon, starmie, staryu, seel, dewgong, poliwag, tentacool, horsea, kingdra, kyogre"),
    "Name a grass-type Pokémon": (lambda: D.pokemon_of_type("grass"), "bulbasaur, ivysaur, venusaur, oddish, bellsprout, chikorita, meganium, treecko, sceptile, turtwig, torterra, snivy, serperior, chespin, rowlet, decidueye, grookey, rillaboom, sprigatito, leafeon, exeggcute, tangela, sunkern, cacnea, roserade, celebi, shaymin"),
    "Name an electric-type Pokémon": (lambda: D.pokemon_of_type("electric"), "pikachu, raichu, pichu, jolteon, zapdos, magnemite, magneton, voltorb, electrode, electabuzz, ampharos, mareep, elekid, raikou, plusle, minun, shinx, luxray, pachirisu, emolga, zekrom, tapu koko, toxtricity, morpeko, pawmot"),
    "Name a psychic-type Pokémon": (lambda: D.pokemon_of_type("psychic"), "mewtwo, mew, abra, kadabra, alakazam, espeon, psyduck? , slowpoke, slowbro, jynx, mr. mime, drowzee, hypno, exeggutor, wobbuffet, girafarig, natu, xatu, ralts, kirlia, gardevoir, gallade, lugia, deoxys, jirachi, latios, latias, celebi, meowstic"),
    "Name a dragon-type Pokémon": (lambda: D.pokemon_of_type("dragon"), "dragonite, dratini, dragonair, rayquaza, garchomp, gible, salamence, bagon, kingdra, flygon, altaria, latios, latias, dialga, palkia, giratina, reshiram, zekrom, kyurem, haxorus, hydreigon, goodra, noivern, dragapult, kommo-o, eternatus"),
    "Name a ghost-type Pokémon": (lambda: D.pokemon_of_type("ghost"), "gengar, gastly, haunter, misdreavus, shedinja, sableye, shuppet, banette, duskull, dusclops, dusknoir, drifloon, drifblim, mismagius, spiritomb, froslass, rotom, giratina, litwick, chandelure, golett, golurk, phantump, trevenant, pumpkaboo, mimikyu, dragapult, polteageist"),
    "Name a flying-type Pokémon": (lambda: D.pokemon_of_type("flying"), "pidgey, pidgeotto, pidgeot, charizard, zubat, golbat, crobat, spearow, fearow, butterfree, dragonite, gyarados, articuno, zapdos, moltres, lugia, ho-oh, rayquaza, togekiss, staraptor, talonflame, corviknight, noctowl, hoothoot, pelipper, wingull, swablu, altaria, aerodactyl, scyther"),
    "Name a city in Spain": (lambda: D.cities_in("Spain"), None),
    "Name a city in Italy": (lambda: D.cities_in("Italy"), None),
    "Name a city in France": (lambda: D.cities_in("France"), None),
    "Name a city in Germany": (lambda: D.cities_in("Germany"), None),
    "Name a city in Japan": (lambda: D.cities_in("Japan"), None),
    "Name a city in Australia": (lambda: D.cities_in("Australia"), None),
    "Name a city in Canada": (lambda: D.cities_in("Canada"), None),
    "Name a city in India": (lambda: D.cities_in("India"), None),
    "Name a town or city in Scotland": (lambda: D.cities_in("United Kingdom", "Scotland"), None),
    "Name a Mario game": (lambda: [e for e in D.video_games() if re.search(r"mario|luigi|yoshi|wario", e[0][0], re.I)], None),
    "Name a racing game": (lambda: D.video_games_where(genre="Racing"), None),
    "Name a shooter game": (lambda: D.video_games_where(genre="Shooter"), None),
    "Name a fighting game": (lambda: D.video_games_where(genre="Fighting"), None),
    "Name a sports video game": (lambda: D.video_games_where(genre="Sports"), None),
    "Name a Nintendo game": (lambda: D.video_games_where(publisher="Nintendo"), None),
    "Name a PlayStation game": (lambda: D.video_games_where(platforms={"PS", "PS2", "PS3", "PS4", "PSP", "PSV"}), None),
    "Name a Stephen King book": (lambda: D.books_by("Stephen King"), "it, the shining, carrie, misery, pet sematary, the stand, salem's lot, cujo, christine, the green mile, the dark tower, 11/22/63, under the dome, doctor sleep, firestarter, the dead zone, different seasons, the body, rita hayworth and shawshank redemption, the outsider, the institute, holly, billy summers, fairy tale, gerald's game, dolores claiborne, the long walk, the running man, thinner, needful things, insomnia, rose madder, desperation, bag of bones, dreamcatcher, cell, duma key, 1408, mr. mercedes, revival, joyland, later, the talisman"),
    "Name an Agatha Christie novel": (lambda: D.books_by("Agatha Christie"), "murder on the orient express, and then there were none, death on the nile, the murder of roger ackroyd, the mysterious affair at styles, the abc murders, evil under the sun, the murder at the vicarage, a murder is announced, crooked house, the body in the library, peril at end house, five little pigs, appointment with death, cards on the table, the mirror crack'd from side to side, 4.50 from paddington, sleeping murder, hallowe'en party, the pale horse, endless night, the secret adversary, the big four, nemesis, a pocket full of rye, the moving finger, the hollow, curtain, death in the clouds, the mousetrap, witness for the prosecution"),
    "Name a Terry Pratchett book": (lambda: D.books_by("Terry Pratchett"), "good omens, the colour of magic, mort, guards! guards!, small gods, going postal, night watch, the wee free men, hogfather, wyrd sisters, the light fantastic, equal rites, sourcery, pyramids, eric, moving pictures, reaper man, witches abroad, lords and ladies, men at arms, soul music, interesting times, maskerade, feet of clay, jingo, the last continent, carpe jugulum, the fifth elephant, the truth, thief of time, the amazing maurice and his educated rodents, monstrous regiment, thud!, making money, unseen academicals, snuff, raising steam, the shepherd's crown, nation, the carpet people, truckers, johnny and the dead"),
    "Name a Roald Dahl book": (lambda: D.books_by("Roald Dahl"), "charlie and the chocolate factory, matilda, the bfg, the twits, james and the giant peach, fantastic mr fox, the witches, george's marvellous medicine, danny the champion of the world, the enormous crocodile, esio trot, the giraffe and the pelly and me, charlie and the great glass elevator, boy, going solo, revolting rhymes, dirty beasts, the magic finger, the minpins, billy and the minpins, the vicar of nibbleswicke, tales of the unexpected, the gremlins, rhyme stew, kiss kiss, someone like you, my uncle oswald, the wonderful story of henry sugar, the umbrella man, lamb to the slaughter"),
    "Name a palindrome": (D.palindromes, "racecar, level, mum, dad, madam, kayak, radar, noon, wow, civic, refer, rotor, anna, hannah, bob, eve, otto, stats, tenet, deed, peep, pop, poop, eye, sees, solos, redder, rotator, reviver, repaper, deified, malayalam, nun, gig, tot, did, ewe, pip, pup? , sagas, minim, sexes, shahs, kook, boob, toot, tit, nan, wow, aha"),
    "Name a word that rhymes with cake": (lambda: D.rhymes("cake"), None),
    "Name a word that rhymes with star": (lambda: D.rhymes("star"), None),
    "Name a word that rhymes with bear": (lambda: D.rhymes("bear"), None),
    "Name a word that rhymes with moon": (lambda: D.rhymes("moon"), None),
    "Name a word that rhymes with rain": (lambda: D.rhymes("rain"), None),
    "Name a word that rhymes with ball": (lambda: D.rhymes("ball"), None),
    "Name a word that rhymes with tree": (lambda: D.rhymes("tree"), None),
    "Name a good name for a dog": (lambda: D.baby_names(), None),
}
# ---- round 5: more data-driven prompts ----
SONG_ARTISTS_5 = ["Future", "The Weeknd", "Elton John", "Kenny Chesney", "Tim McGraw", "Madonna", "Lil Baby", "Bad Bunny", "Ariana Grande",
    "Kendrick Lamar", "Mariah Carey", "Bruno Mars", "Keith Urban", "Ludacris", "Ed Sheeran", "Michael Jackson", "Jason Aldean", "Luke Combs",
    "Eminem", "21 Savage", "Stevie Wonder", "Travis Scott", "P!nk", "Carrie Underwood", "Luke Bryan", "Rod Stewart", "Blake Shelton",
    "Pitbull", "Whitney Houston", "Cardi B", "T-Pain", "James Brown", "Prince", "Mary J. Blige", "Diana Ross", "The Beatles", "Katy Perry",
    "Young Thug", "Akon", "The Rolling Stones", "Marvin Gaye", "George Strait", "Neil Diamond", "The Beach Boys", "Nelly", "Toby Keith",
    "Britney Spears", "Ray Charles", "50 Cent", "Snoop Dogg", "Ne-Yo", "Kenny Rogers", "The Temptations", "J. Cole", "Phil Collins",
    "Janet Jackson", "Flo Rida", "DJ Khaled", "Christina Aguilera", "Juice WRLD", "Alicia Keys", "Aerosmith", "Olivia Newton-John",
    "Dionne Warwick", "Barbra Streisand", "Khalid", "Smokey Robinson", "Eric Church", "Thomas Rhett", "Dierks Bentley"]
for _a in SONG_ARTISTS_5:
    _q = f"Name a song by {_a}"
    if _q not in PROMPTS:
        V4_DATA[_q] = ((lambda a=_a: D.songs(a)), None)
BOOK_AUTHORS_5 = ["J.K. Rowling", "Stephenie Meyer", "Rick Riordan", "William Shakespeare", "Nicholas Sparks", "C.S. Lewis", "James Patterson",
    "George R.R. Martin", "John Grisham", "Neil Gaiman", "Jodi Picoult", "Charles Dickens", "Dr. Seuss", "Paulo Coelho", "Sophie Kinsella",
    "Douglas Adams", "Michael Crichton", "Dean Koontz", "Ernest Hemingway", "Anne Rice", "Brandon Sanderson", "Haruki Murakami",
    "Isaac Asimov", "Margaret Atwood", "Colleen Hoover", "Ken Follett", "Lee Child", "Arthur Conan Doyle", "Tom Clancy", "Bill Bryson",
    "David Baldacci", "Jeff Kinney", "Edgar Allan Poe", "Kristin Hannah", "John Steinbeck", "Jane Austen", "Mark Twain", "Oscar Wilde", "Philip Pullman", "Enid Blyton"]
for _a in BOOK_AUTHORS_5:
    _q = f"Name a book by {_a}"
    if not any(_a.split()[-1] in q for q in PROMPTS if "book" in q or "novel" in q):
        V4_DATA[_q] = ((lambda a=_a: D.books_by(a)), None)
POKE_HEADS = {
    "rock": "onix, geodude, graveler, golem, rhyhorn, rhydon, aerodactyl, omanyte, kabuto, sudowoodo, tyranitar, larvitar, nosepass, aron, lairon, aggron, cranidos, rampardos, rockruff, lycanroc, boldore, gigalith, roggenrola, tyrunt",
    "ground": "diglett, dugtrio, sandshrew, sandslash, cubone, marowak, rhyhorn, rhydon, onix, geodude, phanpy, donphan, groudon, gible, garchomp, krookodile, excadrill, mudsdale, sandaconda, swampert, whiscash, flygon, hippowdon",
    "ice": "lapras, articuno, jynx, cloyster, dewgong, sneasel, weavile, swinub, piloswine, mamoswine, snorunt, glalie, froslass, glaceon, regice, kyurem, vanillite, vanilluxe, cubchoo, beartic, alolan vulpix, eiscue, frosmoth, snom",
    "fighting": "machop, machoke, machamp, hitmonlee, hitmonchan, hitmontop, primeape, mankey, poliwrath, heracross, lucario, riolu, blaziken, infernape, emboar, makuhita, hariyama, meditite, medicham, conkeldurr, sawk, throh, hawlucha, pangoro",
    "poison": "ekans, arbok, koffing, weezing, grimer, muk, nidoran, nidoking, nidoqueen, gengar, zubat, golbat, crobat, tentacool, tentacruel, venomoth, beedrill, weedle, bulbasaur, oddish, gloom, vileplume, seviper, skuntank, toxapex, salazzle",
    "bug": "caterpie, metapod, butterfree, weedle, kakuna, beedrill, scyther, pinsir, paras, parasect, venonat, venomoth, heracross, scizor, ledyba, spinarak, ariados, wurmple, beautifly, dustox, kricketot, kricketune, combee, vespiquen, volcarona, vikavolt, grubbin, genesect",
    "steel": "magnemite, magneton, steelix, scizor, skarmory, aron, lairon, aggron, metagross, beldum, metang, lucario, dialga, registeel, jirachi, bronzong, klink, excadrill, ferrothorn, aegislash, honedge, corviknight, melmetal, zacian, tinkaton",
    "dark": "umbreon, tyranitar, houndoom, houndour, sneasel, weavile, murkrow, honchkrow, absol, sableye, darkrai, zoroark, zorua, hydreigon, krookodile, bisharp, greninja, incineroar, yveltal, grimmsnarl, obstagoon, mightyena, poochyena, scrafty",
    "fairy": "clefairy, clefable, jigglypuff, wigglytuff, togepi, togekiss, sylveon, gardevoir, mr. mime, snubbull, granbull, azurill, marill, azumarill, mawile, flabebe, florges, spritzee, aromatisse, swirlix, slurpuff, dedenne, xerneas, mimikyu, tinkaton, hatterene",
    "normal": "snorlax, eevee, meowth, persian, rattata, raticate, pidgey, jigglypuff, chansey, blissey, kangaskhan, tauros, ditto, porygon, lickitung, sentret, furret, aipom, ambipom, teddiursa, ursaring, slakoth, slaking, zigzagoon, linoone, whismur, loudred, exploud, bidoof, bibarel, lillipup, stoutland, arceus",
}
for _t, _h in POKE_HEADS.items():
    V4_DATA[f"Name a{'n' if _t[0] in 'aeiou' else ''} {_t}-type Pokémon"] = ((lambda t=_t: D.pokemon_of_type(t)), _h)
_G = lambda **kw: (lambda: D.video_games_where(**kw))
_N = lambda rx: (lambda: [e for e in D.video_games() if re.search(rx, e[0][0], re.I)])
V4_DATA.update({
    "Name a role-playing game": (_G(genre="Role-Playing"), "pokemon, final fantasy, the elder scrolls v skyrim|skyrim, the witcher 3|the witcher, fallout, mass effect, dragon age, baldur's gate 3|baldur's gate, kingdom hearts, dark souls, elden ring, persona 5|persona, dragon quest, chrono trigger, diablo, world of warcraft, cyberpunk 2077, star wars knights of the old republic|kotor, xenoblade chronicles, fable, oblivion, morrowind, divinity original sin, undertale, earthbound, paper mario, octopath traveler, nier automata, monster hunter, path of exile"),
    "Name a platform game": (_G(genre="Platform"), "super mario bros., sonic the hedgehog, crash bandicoot, spyro, super mario 64, donkey kong country, rayman, celeste, hollow knight, cuphead, ori and the blind forest, little big planet, banjo-kazooie, kirby, mega man, castlevania, metroid, super meat boy, ratchet and clank, jak and daxter, sly cooper, astro bot, shovel knight, super mario odyssey, yoshi's island, limbo, inside, braid, it takes two, a hat in time"),
    "Name a puzzle game": (_G(genre="Puzzle"), "tetris, candy crush, portal, bejeweled, wordle, minesweeper, monument valley, the witness, lemmings, dr. mario, puzzle bobble|bust-a-move, professor layton, brain training, the talos principle, baba is you, return of the obra dinn, cut the rope, angry birds, 2048, sudoku, picross, peggle, zuma, world of goo, braid, fez, the room, captain toad, myst, the 7th guest"),
    "Name a simulation game": (_G(genre="Simulation"), "the sims, animal crossing, stardew valley, minecraft, cities skylines, sim city, rollercoaster tycoon, planet coaster, farming simulator, flight simulator, euro truck simulator, two point hospital, theme hospital, nintendogs, harvest moon, house flipper, powerwash simulator, goat simulator, surgeon simulator, viva pinata, zoo tycoon, planet zoo, kerbal space program, rimworld, the sims 4, tamagotchi, jurassic world evolution, frostpunk, cooking mama, spore"),
    "Name a strategy game": (_G(genre="Strategy"), "civilization, age of empires, starcraft, command and conquer, total war, xcom, warcraft, company of heroes, stellaris, crusader kings, europa universalis, hearts of iron, advance wars, fire emblem, pikmin, plants vs zombies, clash of clans, clash royale, into the breach, red alert, halo wars, homeworld, dune ii, anno, tropico, worms, valkyria chronicles, northgard, they are billions, endless legend"),
    "Name an adventure game": (_G(genre="Adventure"), "the legend of zelda|zelda, uncharted, tomb raider, the last of us, red dead redemption, assassin's creed, god of war, monkey island, grim fandango, life is strange, the walking dead, heavy rain, detroit become human, until dawn, firewatch, journey, shadow of the colossus, ico, okami, beyond good and evil, broken sword, day of the tentacle, myst, l.a. noire, outer wilds, sea of thieves, minecraft dungeons, ghost of tsushima, horizon zero dawn, death stranding"),
    "Name an Xbox game": (_G(platforms={"XB", "X360", "XOne"}), "halo, gears of war, forza horizon, fable, sea of thieves, minecraft, call of duty, grand theft auto, fifa, kinect sports, crackdown, banjo-kazooie nuts and bolts, viva pinata, perfect dark zero, alan wake, state of decay, starfield, the elder scrolls v skyrim, fallout 3, mass effect, dead rising, lost odyssey, project gotham racing, ori and the blind forest, cuphead, halo infinite, forza motorsport, hellblade, grounded, microsoft flight simulator"),
    "Name a Sonic game": (_N(r"sonic"), "sonic the hedgehog, sonic 2, sonic 3, sonic and knuckles, sonic adventure, sonic adventure 2, sonic heroes, sonic generations, sonic mania, sonic frontiers, sonic colors, sonic unleashed, sonic forces, sonic cd, sonic the hedgehog 2006, sonic riders, shadow the hedgehog, sonic and sega all-stars racing, mario and sonic at the olympic games, sonic lost world, sonic rush, sonic advance, sonic spinball, sonic r, team sonic racing, sonic superstars, sonic x shadow generations, sonic dash, sonic boom, sonic 3d blast"),
    "Name a Zelda game": (_N(r"zelda"), "breath of the wild, tears of the kingdom, ocarina of time, majora's mask, twilight princess, the wind waker, a link to the past, link's awakening, skyward sword, the legend of zelda, zelda ii the adventure of link, a link between worlds, the minish cap, phantom hourglass, spirit tracks, oracle of ages, oracle of seasons, four swords, tri force heroes, echoes of wisdom, hyrule warriors, age of calamity, cadence of hyrule"),
    "Name a Pokémon game": (_N(r"pok[eé]mon"), "pokemon red, pokemon blue, pokemon yellow, pokemon gold, pokemon silver, pokemon crystal, pokemon ruby, pokemon sapphire, pokemon emerald, pokemon firered, pokemon diamond, pokemon pearl, pokemon platinum, pokemon heartgold, pokemon black, pokemon white, pokemon x, pokemon y, pokemon sun, pokemon moon, pokemon sword, pokemon shield, pokemon scarlet, pokemon violet, pokemon legends arceus, pokemon go, pokemon let's go pikachu, pokemon snap, pokemon stadium, pokemon mystery dungeon, pokemon unite, pokemon colosseum, pokemon legends z-a, pokemon brilliant diamond"),
    "Name a Final Fantasy game": (_N(r"final fantasy"), "final fantasy vii|final fantasy 7, final fantasy x|final fantasy 10, final fantasy xiv|final fantasy 14, final fantasy vi|final fantasy 6, final fantasy ix|final fantasy 9, final fantasy viii|final fantasy 8, final fantasy xv|final fantasy 15, final fantasy xvi|final fantasy 16, final fantasy xii|final fantasy 12, final fantasy iv|final fantasy 4, final fantasy, final fantasy xiii|final fantasy 13, final fantasy vii remake, final fantasy vii rebirth, final fantasy tactics, final fantasy x-2, final fantasy xi, final fantasy v, final fantasy iii, final fantasy ii, dissidia, crisis core"),
    "Name a LEGO video game": (_N(r"^lego"), "lego star wars, lego batman, lego harry potter, lego marvel super heroes, lego indiana jones, lego the lord of the rings, lego the hobbit, lego jurassic world, lego city undercover, lego dimensions, lego the incredibles, lego avengers, lego pirates of the caribbean, lego the skywalker saga, lego batman 2, lego movie videogame, lego worlds, lego island, lego racers, lego fortnite, lego horizon adventures, lego builder's journey, lego dc super-villains, lego marvel super heroes 2"),
})
CITY_HEADS = {
    ("Name a city in China", "China", None): "beijing, shanghai, hong kong, shenzhen, guangzhou, chengdu, wuhan, xi'an, hangzhou, chongqing, nanjing, tianjin, macau, suzhou, harbin, qingdao, kunming, guilin, xiamen, dalian, shenyang, changsha, lhasa, sanya, urumqi, zhengzhou, jinan, hefei, fuzhou, ningbo",
    ("Name a city in Brazil", "Brazil", None): "rio de janeiro|rio, sao paulo, brasilia, salvador, fortaleza, belo horizonte, manaus, recife, porto alegre, curitiba, belem, florianopolis, natal, goiania, campinas, santos, foz do iguacu, maceio, joao pessoa, cuiaba, vitoria, teresina, campo grande, aracaju, porto velho, paraty, buzios, ouro preto, olinda, petropolis",
    ("Name a city in Mexico", "Mexico", None): "mexico city, cancun, guadalajara, monterrey, tijuana, acapulco, puerto vallarta, oaxaca, puebla, merida, playa del carmen, tulum, cabo san lucas|los cabos, chihuahua, juarez|ciudad juarez, leon, queretaro, san miguel de allende, veracruz, mazatlan, morelia, aguascalientes, durango, saltillo, hermosillo, culiacan, toluca, cuernavaca, guanajuato, zacatecas",
    ("Name a city in Russia", "Russia", None): "moscow, st petersburg|saint petersburg, novosibirsk, yekaterinburg, kazan, sochi, vladivostok, kaliningrad, volgograd, murmansk, samara, omsk, nizhny novgorod, rostov-on-don, ufa, krasnoyarsk, perm, voronezh, irkutsk, yakutsk, chelyabinsk, sevastopol? , tula, yaroslavl, novgorod, archangelsk, khabarovsk, tomsk, saratov, grozny",
    ("Name a city in the Netherlands", "Netherlands", None): "amsterdam, rotterdam, the hague|den haag, utrecht, eindhoven, groningen, maastricht, delft, haarlem, leiden, nijmegen, tilburg, breda, arnhem, zwolle, almere, den bosch|'s-hertogenbosch, enschede, apeldoorn, amersfoort, alkmaar, gouda, edam, volendam, zaandam, schiedam, dordrecht, hilversum, middelburg, leeuwarden",
    ("Name a city in Portugal", "Portugal", None): "lisbon, porto, faro, albufeira, lagos, coimbra, braga, funchal, sintra, cascais, evora, aveiro, guimaraes, portimao, vilamoura, setubal, viseu, leiria, tavira, nazare, obidos, fatima, estoril, ponta delgada, vila nova de gaia, amadora, matosinhos, almada, viana do castelo, braganca",
    ("Name a city in Greece", "Greece", None): "athens, thessaloniki, heraklion, patras, rhodes, chania, corfu, larissa, volos, ioannina, kalamata, mykonos, santorini|thira, kavala, nafplio, sparta, olympia, delphi, zakynthos, kos, alexandroupoli, rethymno, chalcis, piraeus, argos, corinth, lamia, katerini, serres, trikala",
    ("Name a city in Turkey", "Turkey", None): "istanbul, ankara, izmir, antalya, bodrum, bursa, adana, konya, gaziantep, trabzon, fethiye, marmaris, alanya, kusadasi, side, dalaman, cappadocia? , kayseri, eskisehir, diyarbakir, mersin, samsun, edirne, canakkale, denizli, pamukkale? , erzurum, van, sanliurfa, hatay",
    ("Name a city in Ireland", "Ireland", None): "dublin, cork, galway, limerick, waterford, kilkenny, killarney, sligo, drogheda, dundalk, wexford, athlone, tralee, ennis, letterkenny, kinsale, westport, carlow, navan, bray, swords, naas, tullamore, mullingar, clonmel, cobh, dingle, howth, dun laoghaire, kildare",
    ("Name a city in Texas", "United States", "Texas"): "houston, dallas, austin, san antonio, fort worth, el paso, arlington, corpus christi, plano, lubbock, laredo, irving, amarillo, waco, galveston, brownsville, mcallen, frisco, abilene, odessa, midland, beaumont, denton, round rock, killeen, college station, tyler, wichita falls, san marcos, sugar land",
    ("Name a city in California", "United States", "California"): "los angeles, san francisco, san diego, sacramento, san jose, oakland, fresno, long beach, anaheim, santa monica, malibu, beverly hills, palm springs, berkeley, pasadena, hollywood? , santa barbara, irvine, riverside, bakersfield, santa cruz, monterey, napa, carmel, stockton, modesto, burbank, glendale, santa ana, palo alto",
    ("Name a city in Florida", "United States", "Florida"): "miami, orlando, tampa, jacksonville, tallahassee, fort lauderdale, key west, st petersburg, naples, sarasota, west palm beach, palm beach, daytona beach, gainesville, pensacola, clearwater, fort myers, boca raton, kissimmee, miami beach, cape coral, hollywood, st augustine, destin, panama city, ocala, lakeland, melbourne, cocoa beach, coral gables",
    ("Name a city in New York State", "United States", "New York"): "new york city|new york, buffalo, rochester, albany, syracuse, yonkers, ithaca, niagara falls, poughkeepsie, utica, schenectady, binghamton, saratoga springs, white plains, new rochelle, mount vernon, troy, long beach, hempstead, the hamptons? , brooklyn? , ithaca, lake placid, cooperstown, woodstock, kingston, newburgh, elmira, jamestown, watertown",
}
for (_q, _c, _sub), _h in CITY_HEADS.items():
    V4_DATA[_q] = ((lambda c=_c, sub=_sub: D.cities_in(c, sub)), _h)

for _q, (_loader, _head) in V4_DATA.items():
    CUSTOM[_q] = (_loader, 0 if (_head or _q in DATA_HEADS) else 60, 0)
    if _head:
        PROMPTS[_q] = re.sub(r"[^,]*\? ?(?=,|$)", "", _head)
    PROMPTS.setdefault(_q, "")
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
