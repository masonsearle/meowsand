# 🧶 Meowsand — one in a thousand, meowsand

A cat-themed, Krillion-style word game. Name a thing, and the **rarer** your answer, the further the ball of yarn rolls (with the cat in hot pursuit).

- **Daily Chase**: 7 prompts, 25 seconds each, the same for everyone that day
- **Unlimited**: endless chases, never locked behind a daily limit
- **Two packs**, switchable on the title screen. Each has its own daily chase, streak and journey:
  - 🧶 **Classic**: about 890 prompts and 32,000 answers. Singers include every act that has charted on the Billboard Hot 100 (1958–now), and languages include ISO languages plus creoles
  - 🎬 **Movies**: about 820 prompts and 88,000 answers. Genres, decades, 40 actors' filmographies, directors, franchises, villains, characters, and "movie with a colour in its title"-style prompts
- Unlimited is one continuous journey through 9 biomes: Meadow → Shores → Autumn Woods → Dunes → Snowy Peaks → Moonlit Moors → Neon Alley → Candy Canyon → The Moon (then it loops)
- **◀ BACK / Esc** saves your chase, timer included, so you can resume it later from the title screen
- Typos and plurals are forgiven, and it runs fully static on GitHub Pages (no server)

## Play locally
Browsers block `fetch` from `file://`, so run a tiny server:
```bash
python -m http.server 8000   # then open http://localhost:8000
```

## Deploy on GitHub Pages
1. Push these files to the repo root (`index.html`, `style.css`, `game.js`, `data/`, `tools/`).
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `(root)`.
3. Your game will be live at `https://<username>.github.io/meowsand/`.

## "Technically true" answers
Prompts borrow answers from each other (`tools/includes.py`), so every bird counts as something that flies, every dog breed is an animal, and any food is something in a kitchen. Each borrowed category has a weight for how often players would reach for it, so the rarity stays realistic.

In Movies, sequel numbers autocorrect (`tools/franchises.py`): "matrix 2" counts as The Matrix Reloaded, "star wars 5" as The Empire Strikes Back, and "rocky 2", "rocky ii" and "rocky part two" all match.

## Rebuilding the data
```bash
bash tools/fetch_sources.sh      # downloads ../corpora and ../sources (open datasets)
pip install wordfreq
python tools/build_data.py       # -> data/prompts.json  (Classic)
python tools/build_movies.py     # -> data/movies.json   (Movies)
```
Open datasets used: [dariusk/corpora](https://github.com/dariusk/corpora), the [Billboard Hot 100 archive](https://github.com/utdata/rwd-billboard-data), [ISO language codes](https://github.com/datasets/language-codes), [Wikipedia film data](https://github.com/prust/wikipedia-movie-data) (36k films with cast and genres), and [vega-datasets movies](https://github.com/vega/vega-datasets) (IMDb vote counts for popularity).

## Where the answers & rarity come from
Krillion-type games measure rarity from what real players type. A static site has no players' data, so Meowsand **estimates** it:

1. **Hand-ordered lists** (`tools/categories.py`): each prompt lists answers from most to least obvious ("apple" first, "kiwano" last). Rank becomes a Zipf-style share.
2. **Word frequency**: the [`wordfreq`](https://pypi.org/project/wordfreq/) package says how common each word is across books, web and subtitles, and that's blended in.
3. **Long tails**: the open [dariusk/corpora](https://github.com/dariusk/corpora) dataset adds thousands of extra valid answers (1,400 dinosaurs, 1,900 cheeses, 450 dog breeds…). These all count as rare answers.

Scoring: `metres = 40 × log10(N)`, so a 1-in-10 answer = 40 m, 1-in-1,000 = 120 m, and 1-in-100,000 = 200 m.

## Getting more prompts (the scalable way)
Every prompt is multiplied automatically: the game makes **"…starting with P"** remixes for each letter that has at least 8 answers. So each new prompt you add brings roughly 5 more with it.

To add prompts in bulk, use the AI generator:
```bash
pip install anthropic wordfreq
export ANTHROPIC_API_KEY=sk-ant-...           # from console.anthropic.com
python tools/generate_prompts.py 50           # generate 50 from tools/prompt_ideas.txt
python tools/build_data.py && python tools/build_movies.py
```
`tools/prompt_ideas.txt` already has about 400 prompt ideas ready to go. Add more lines to it whenever you like. Each generated list lands in `tools/generated/` as a plain text file, so skim them and delete or edit any bad ones before publishing. It costs roughly 1-2p per prompt.

## Adding prompts by hand
Edit `tools/categories.py`, `tools/categories_more.py`, `tools/categories_extend.py` (extra answers for existing prompts) or `tools/movies_heads.py` (Movies) (comma-separated, most common first, `a|b` for aliases), then:
```bash
pip install wordfreq
git clone --depth 1 https://github.com/dariusk/corpora.git ../corpora   # optional
python tools/build_data.py && python tools/build_movies.py
```
That rewrites `data/prompts.json`. Commit it and Pages redeploys.

## Upgrading to real player rarity (optional, later)
Hook up a free backend (Supabase or Firebase): log each `(prompt, answer)` and blend live counts into `n` once a prompt has a few hundred plays. Keep the estimates as the fallback for cold starts.
