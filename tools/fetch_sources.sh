#!/usr/bin/env bash
# Downloads the open datasets the build scripts use, next to this repo:
#   ../corpora  and  ../sources
set -e
cd "$(dirname "$0")/../.."
[ -d corpora ] || git clone --depth 1 https://github.com/dariusk/corpora.git
mkdir -p sources
R=https://raw.githubusercontent.com
curl -sSL -o sources/wiki_movies.json  $R/prust/wikipedia-movie-data/master/movies.json
curl -sSL -o sources/vega_movies.json  $R/vega/vega-datasets/main/data/movies.json
curl -sSL -o sources/languages.csv     $R/datasets/language-codes/main/data/language-codes-full.csv
curl -sSL -o sources/billboard.csv     $R/utdata/rwd-billboard-data/main/data-out/hot-100-current.csv
echo "done: ../corpora and ../sources ready"
