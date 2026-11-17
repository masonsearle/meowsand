# "Technically true" answers: a prompt can accept answers from other prompts.
# e.g. every bird is "something that flies"; every dog breed is "an animal".
# Included answers rank as rarer than the prompt's own list, in the order of
# how common they are in their source prompt.
#
# Each entry: (source prompt, filter)  where filter is
#   None                -> take everything
#   ("only", "a, b")    -> only these answers
#   ("except", "a, b")  -> everything but these

FLYING_INSECTS_EXCEPT = """ant, caterpillar, flea, louse|lice, bed bug, centipede, woodlouse, silverfish, stick insect, walking stick, mealworm,
silkworm, earwig, termite, aphid, scale insect, spider, leaf insect, water boatman, pond skater, thrips, weevil"""

FLYING_HEROES = """superman, thor, iron man, captain marvel, the vision|vision, wonder woman, supergirl, the falcon|falcon, storm, green lantern,
martian manhunter, shazam, hawkman, hawkgirl, starfire, angel, archangel, silver surfer, nova, star-lord, rocket, groot? , ghost rider,
doctor strange, scarlet witch|wanda, jean grey|phoenix, ms marvel, captain marvel, war machine, ironheart, homelander, omni-man, invincible,
atom eve, power girl, black adam, sentry, firestorm, raven, beast boy, superboy, mary marvel, banshee, iceman, human torch, the human torch,
silver sable? , blue beetle, hellboy? , ultraman, mr incredible? , syndrome, buzz lightyear, megamind, metro man, bolt? , baymax, peter pan,
spawn, vision, darkhawk, sunfire, cannonball, polaris, magneto, thanos? , all might? , deku? , saitama, genos? , sailor moon? """

AIRCRAFT = """plane|aeroplane|airplane, helicopter, rocket, hot air balloon, blimp|airship, glider, space shuttle, zeppelin, drone, jet, hovercraft? """

FLYING_MYTH = """dragon, phoenix, griffin|gryphon, pegasus, fairy, harpy, angel, wyvern, roc, thunderbird, hippogriff, tengu, garuda, mothman, pixie,
vampire, banshee, ghost, valkyrie, sphinx? , manticore? , chimera? , qilin, baku? , kitsune? , djinn|genie, witch, nue"""

ROUND_FRUIT = """orange, apple, grape, cherry, melon, watermelon, peach, plum, lime, lemon, grapefruit, tangerine, clementine, satsuma, mandarin,
blueberry, cantaloupe, honeydew, nectarine, apricot, pomegranate, coconut, kumquat, gooseberry, blackcurrant, redcurrant, lychee, tomato,
passion fruit, persimmon, kiwi, olive, cranberry, pomelo, longan, rambutan, mangosteen, durian, physalis, sloe, damson, greengage"""

NON_WHEELED = """boat, ship, submarine, canoe, kayak, yacht, ferry, jet ski, raft, catamaran, pedalo, hot air balloon, blimp|airship, rocket,
glider, space shuttle, helicopter, hovercraft, sleigh|sledge, cable car, gondola, zeppelin, horse and cart? , skis, surfboard"""

COLD_WEATHER = """snow, hail, sleet, frost, blizzard, ice, freezing rain, black ice, snowstorm, whiteout, cold snap, polar vortex, hailstorm, graupel"""

NON_PET_BIRDS = None  # birds are all allowed as pets? no, see "Name a pet" below

INCLUDES = {
"Name an animal": [("Name a bird", None), ("Name a sea creature", None), ("Name an insect or creepy crawly", None),
                   ("Name a reptile", None), ("Name a dog breed", None), ("Name a cat breed", None), ("Name a horse breed", None),
                   ("Name a big cat", None), ("Name a farm animal", None), ("Name a baby animal", None), ("Name a pet", None),
                   ("Name a dinosaur", None)],
"Name a pet": [("Name a dog breed", None), ("Name a cat breed", None), ("Name a reptile", ("except", "crocodile, alligator, komodo dragon, gharial, caiman, sea turtle, leatherback turtle, black mamba, king cobra, taipan, gila monster, dinosaur")),
               ("Name a farm animal", None), ("Name a horse breed", None),
               ("Name a bird", ("only", "budgie|budgerigar, canary, parrot, cockatoo, cockatiel, macaw, finch, lovebird, african grey, chicken, duck, goose, pigeon, dove, quail, myna, conure, lorikeet, parakeet, zebra finch, owl, raven, crow, magpie, peacock, turkey"))],
"Name a reptile": [("Name a dinosaur", None)],
"Name a farm animal": [("Name a horse breed", None)],
"Name something that flies": [("Name a bird", ("except", "penguin, ostrich, emu, kiwi, cassowary, rhea, dodo, kakapo")),
                              ("Name an insect or creepy crawly", ("except", FLYING_INSECTS_EXCEPT)),
                              ("Name a superhero", ("only", FLYING_HEROES)), ("Name a vehicle", ("only", AIRCRAFT)),
                              ("Name a mythical creature", ("only", FLYING_MYTH)), ("Name a Pokémon", ("only", "pidgey, pidgeotto, pidgeot, spearow, fearow, zubat, golbat, crobat, charizard, dragonite, articuno, zapdos, moltres, butterfree, beedrill, scyther, aerodactyl, lugia, ho-oh, rayquaza, noctowl, hoothoot, togekiss, salamence, flygon, staraptor, talonflame, corviknight, yveltal, pelipper, wingull, swablu, altaria, tropius, gyarados? , dragonair? , mew, mewtwo, latias, latios"))],
"Name something round": [("Name a planet or moon", None), ("Name a fruit", ("only", ROUND_FRUIT)),
                         ("Name a shape", ("only", "circle, sphere, oval, ellipse, cylinder? , semicircle, torus, annulus, cone? "))],
"Name something with wheels": [("Name a vehicle", ("except", NON_WHEELED)), ("Name a car brand", None)],
"Name something cold": [("Name a type of weather", ("only", COLD_WEATHER)), ("Name a fizzy drink", None), ("Name an ice cream flavour", None)],
"Name something in a kitchen": [("Name a fruit", None), ("Name a vegetable", None), ("Name a herb or spice", None), ("Name a sauce or condiment", None),
                                ("Name a type of cheese", None), ("Name a type of bread", None), ("Name a type of pasta", None),
                                ("Name a breakfast cereal", None), ("Name a hot drink", None), ("Name a snack", None), ("Name a nut", None)],
"Name something a cat might knock off a table": [("Name something in a kitchen", None), ("Name something in a bathroom", None),
                                                 ("Name a fruit", None), ("Name a cat toy or cat item", None)],
"Name a food a cat would steal": [("Name a type of cheese", None), ("Name a sea creature", ("only", "tuna, salmon, cod, sardine, anchovy, mackerel, herring, prawn|shrimp, crab, lobster, haddock, trout, plaice, halibut, sole, sea bass, pollock, whitebait, squid, octopus, mussel, clam, oyster, scallop, eel, kipper, smoked salmon, fish"))],
"Name something you pack for a holiday": [("Name an item of clothing", None), ("Name something in a bathroom", ("except", "toilet, sink, bath, shower, mirror, bin, tiles, tap, plug, extractor fan, towel rail, shower curtain, bidet, scales, medicine cabinet, plunger, toilet brush")),
                                          ("Name a snack", None)],
"Name something you'd find at the beach": [("Name a sea creature", None), ("Name a bird", ("only", "seagull|gull, puffin, tern, sandpiper, oystercatcher, cormorant, gannet, pelican, albatross, plover, curlew, turnstone, kittiwake, guillemot, razorbill, fulmar, skua, frigatebird, booby, heron, egret"))],
"Name a sport": [("Name a martial art", None)],
"Name a hobby": [("Name a sport", None), ("Name a musical instrument", None), ("Name a dance", None), ("Name a martial art", None),
                 ("Name a board game", None), ("Name a card game", None)],
"Name a dessert": [("Name a cake", None), ("Name a biscuit or cookie", None)],
"Name a snack": [("Name a chocolate bar", None), ("Name a sweet or candy", None), ("Name a biscuit or cookie", None), ("Name a nut", None), ("Name a fruit", None)],
"Name a breakfast food": [("Name a breakfast cereal", None), ("Name a type of bread", None)],
"Name a pizza topping": [("Name a type of cheese", None), ("Name a vegetable", None), ("Name a herb or spice", None)],
"Name an ice cream flavour": [("Name a fruit", None), ("Name a nut", None), ("Name a chocolate bar", None), ("Name a biscuit or cookie", None)],
"Name a Halloween costume": [("Name a superhero", None), ("Name a cartoon character", None), ("Name a Harry Potter character", None),
                             ("Name a fictional wizard or witch", None), ("Name a mythical creature", None), ("Name a job", None),
                             ("Name a famous cat", None), ("Name an animal", None)],
"Name a cartoon character": [("Name a Pokémon", None), ("Name a famous cat", None)],
"Name a fictional wizard or witch": [("Name a Harry Potter character", ("except", "dudley, vernon dursley, petunia dursley, hedwig, crookshanks, scabbers, fawkes, buckbeak, norbert, aragog, fluffy, dobby, kreacher, winky, hokey, griphook, firenze, grawp, nagini, peeves, argus filch|filch"))],
"Name a famous landmark": [("Name a mountain", None)],
"Name something in space": [("Name a planet or moon", None), ("Name a constellation", None)],
"Name a colour": [("Name a gemstone", ("only", "ruby, emerald, sapphire, amethyst, jade, topaz, turquoise, amber, aquamarine, pearl, onyx, garnet, citrine, coral, ivory, jet, opal, peridot"))],
"Name something that is yellow": [("Name a fruit", ("only", "banana, lemon, pineapple, mango, star fruit, yellow apple, golden delicious, quince, papaya, passion fruit, yellow plum, yellow kiwi, pomelo, ugli fruit, yuzu, physalis")),
                                 ("Name a flower", ("only", "sunflower, daffodil, buttercup, dandelion, marigold, yellow rose, primrose, forsythia, laburnum, yellow tulip, goldenrod, mimosa, cowslip"))],
"Name a European city": [("Name a capital city", ("only", "london, paris, rome, madrid, berlin, dublin, edinburgh, cardiff, belfast, athens, lisbon, amsterdam, brussels, vienna, stockholm, oslo, copenhagen, helsinki, prague, budapest, warsaw, bern, reykjavik, kyiv|kiev, bucharest, sofia, belgrade, zagreb, ljubljana, bratislava, tallinn, riga, vilnius, minsk, valletta, nicosia, monaco, vaduz, andorra la vella, san marino, luxembourg, podgorica, sarajevo, skopje, tirana, pristina, chisinau, moscow"))],
}

# share of players who'd answer from each borrowed category (default 0.04)
WEIGHTS = {
    "Name an animal": {"Name a bird": .08, "Name a sea creature": .05, "Name an insect or creepy crawly": .04, "Name a reptile": .03,
                       "Name a dog breed": .03, "Name a cat breed": .02, "Name a big cat": .02, "Name a farm animal": .03, "Name a pet": .02,
                       "Name a dinosaur": .02, "Name a horse breed": .01, "Name a baby animal": .01},
    "Name a pet": {"Name a dog breed": .1, "Name a cat breed": .05, "Name a bird": .03, "Name a reptile": .03},
    "Name something that flies": {"Name a bird": .35, "Name an insect or creepy crawly": .1, "Name a vehicle": .1, "Name a superhero": .06,
                                  "Name a mythical creature": .05, "Name a Pokémon": .01},
    "Name something round": {"Name a fruit": .1, "Name a planet or moon": .05, "Name a shape": .05},
    "Name something with wheels": {"Name a vehicle": .2, "Name a car brand": .05},
    "Name something you pack for a holiday": {"Name an item of clothing": .15, "Name something in a bathroom": .1},
    "Name something a cat might knock off a table": {"Name something in a kitchen": .1, "Name something in a bathroom": .05},
    "Name something you'd find at the beach": {"Name a sea creature": .1},
    "Name a hobby": {"Name a sport": .15, "Name a musical instrument": .05},
    "Name a dessert": {"Name a cake": .1, "Name a biscuit or cookie": .05},
    "Name a snack": {"Name a chocolate bar": .1, "Name a sweet or candy": .05, "Name a biscuit or cookie": .05, "Name a fruit": .05},
    "Name a breakfast food": {"Name a breakfast cereal": .1, "Name a type of bread": .05},
    "Name a pizza topping": {"Name a vegetable": .05},
    "Name a Halloween costume": {"Name a superhero": .08, "Name a cartoon character": .05, "Name a mythical creature": .05},
    "Name a fictional wizard or witch": {"Name a Harry Potter character": .2},
    "Name something in space": {"Name a planet or moon": .1, "Name a constellation": .05},
    "Name a European city": {"Name a capital city": .3},
}

import re as _re
for _k, _v in INCLUDES.items():  # strip "x? " uncertain entries from the filters above
    INCLUDES[_k] = [(s, None if f is None else (f[0], _re.sub(r"[^,]*\? ?,?", "", f[1])), WEIGHTS.get(_k, {}).get(s, .04)) for s, f in _v]
FLYING_HEROES = _re.sub(r"[^,]*\? ?,?", "", FLYING_HEROES)
