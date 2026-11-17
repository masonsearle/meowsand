#!/usr/bin/env bash
# Downloads the open datasets the build scripts use, next to this repo:  ../corpora  and  ../sources
set -e
cd "$(dirname "$0")/../.."
[ -d corpora ] || git clone --depth 1 https://github.com/dariusk/corpora.git
mkdir -p sources && cd sources
R=https://raw.githubusercontent.com
get() { curl -sSL -o "$1" "$2" && echo "  ✓ $1"; }
get wiki_movies.json   $R/prust/wikipedia-movie-data/master/movies.json
get vega_movies.json   $R/vega/vega-datasets/main/data/movies.json
get languages.csv      $R/datasets/language-codes/main/data/language-codes-full.csv
get billboard.csv      $R/utdata/rwd-billboard-data/main/data-out/hot-100-current.csv
get cmudict.dict       $R/cmusphinx/cmudict/master/cmudict.dict
get babynames.csv      $R/hadley/data-baby-names/master/baby-names.csv
get goodbooks.csv      $R/zygmuntz/goodbooks-10k/master/books.csv
get pokemon_species.csv $R/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species.csv
get pokemon_names.csv  $R/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv
get bgg.csv            $R/beefsack/bgg-ranking-historicals/master/2024-01-01.csv
get colornames.csv     $R/meodai/color-names/master/src/colornames.csv
get worldcities.csv    $R/datasets/world-cities/master/data/world-cities.csv
get vgsales.csv        $R/Aranaur/aranaur.rbind.io/main/datasets/video_games_sales/vgsales.csv
echo "done: ../corpora and ../sources ready"
