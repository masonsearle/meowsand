# 🧶 Meowsand — one in a thousand, meowsand

A cat-themed, Krillion-style word game. Name a thing, and the **rarer** your answer, the further the ball of yarn rolls (with the cat in hot pursuit).

- **Daily Chase**: 7 prompts, 25 seconds each, the same for everyone that day
- **Unlimited**: endless chases, never locked behind a daily limit
- **Two packs**, switchable on the title screen. Each has its own daily chase, streak and journey:
  - 🧶 **Classic**: 307 prompts and about 284,000 answers (34 of them borrowed from the Movies pack). Every song and act from 68 years of the Billboard Hot 100, 21,000 board games, 11,000 video games, 10,000 books, 32,000 world cities, real rhyming words from the CMU dictionary, and more
  - 🎬 **Movies**: 171 prompts and about 100,000 answers, with its own Hollywood-themed scenery. Genres, decades, 40 actors' filmographies, directors, franchises, villains, characters, and "movie with a colour in its title"-style prompts
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

## Your cat
Tap the cat on the title screen and it meows. **🐈 Customise cat** has 8 breeds (Shorthair, Maine Coon, Persian, Scottish Fold, Siamese, Bengal, Sphynx, Munchkin) and 13 coats. Your choice is saved in the browser.

## Leaderboard + 1v1 setup (optional, about 5 minutes, free)
The site is static, so scores need a tiny free database. Until you fill in `config.js`, the leaderboard simply stays hidden.
1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** in the project, paste this and press **Run**:
```sql
create table scores (
  id bigint generated always as identity primary key,
  day date not null,
  pack text not null check (pack in ('classic', 'movies')),
  name text not null check (char_length(name) between 1 and 10),
  score int not null check (score between 0 and 1600),
  created_at timestamptz not null default now()
);
alter table scores enable row level security;
create policy "anyone can read scores" on scores for select using (true);
create policy "anyone can add today's score" on scores for insert
  with check (day between current_date - 1 and current_date + 1);
```
3. Go to **Project Settings → API**, copy the **Project URL** and the **anon public** key into `config.js`, then push.

Players can submit their Daily Chase score once per day per pack, under a name of up to 10 characters.
Note: like any no-login web game, a determined person could post a fake score directly. If that happens, delete the row in Supabase's Table Editor.

## ⚔️ 1v1 Battle
Play a friend live:
1. Both open the site and press **⚔️ 1V1 BATTLE**, then enter a display name.
2. One of you presses **+ Create lobby**. It appears in the other person's **Open lobbies** list, where they press **Join**.
3. The host presses **Start battle**.

You both get the same prompt. Once you've both answered, the answers are shown side by side, and the difference in metres comes off the lower scorer's health (300 HP each). After both answer, the cats have a cartoon cat-fight before the damage lands. Damage is multiplied by 1.5 after every 7 prompts (×1, ×1.5, ×2.25…). The first cat to 0 loses. The host can start a rematch, and your win/loss record against each friend is saved.

Battles use **Supabase Realtime**, from the same free project and `config.js` as the leaderboard. No extra tables are needed. If lobbies never appear, check that **Realtime** is enabled and public channels are allowed in the Supabase dashboard (Project Settings → Realtime).
For testing on one computer without Supabase, open the site with `?mock` in two tabs (e.g. `index.html?mock`).

## Why lists rather than tagging every answer?
Answers live in category lists, and prompts borrow from each other (`tools/includes.py`): every bird "flies", every dog breed is "an animal". That's tagging at the category level. Where a dataset already carries tags (films with genre, cast and year; songs with artist; cities with country), prompts are built straight from those tags. Hand-tagging 200,000 answers one by one would be slower and less accurate than this.

## "Technically true" answers
Prompts borrow answers from each other (`tools/includes.py`), so every bird counts as something that flies, every dog breed is an animal, and any food is something in a kitchen. Each borrowed category has a weight for how often players would reach for it, so the rarity stays realistic.

In Movies, sequel numbers autocorrect (`tools/franchises.py`): "matrix 2" counts as The Matrix Reloaded, "star wars 5" as The Empire Strikes Back, and "rocky 2", "rocky ii" and "rocky part two" all match.

## Rebuilding the data
```bash
bash tools/fetch_sources.sh      # downloads ../corpora and ../sources (open datasets)
pip install wordfreq
python tools/build_data.py       # -> data/classic/ (Classic: one small file per prompt + index.json)
python tools/build_movies.py     # -> data/movies/  (Movies)
```
Open datasets used: [dariusk/corpora](https://github.com/dariusk/corpora), the [Billboard Hot 100 archive](https://github.com/utdata/rwd-billboard-data), [ISO language codes](https://github.com/datasets/language-codes), [Wikipedia film data](https://github.com/prust/wikipedia-movie-data) (36k films with cast and genres), and [vega-datasets movies](https://github.com/vega/vega-datasets) (IMDb vote counts for popularity).

## Where the answers & rarity come from
Krillion-type games measure rarity from what real players type. A static site has no players' data, so Meowsand **estimates** it:

1. **Hand-ordered lists** (`tools/categories.py`): each prompt lists answers from most to least obvious ("apple" first, "kiwano" last). Rank becomes a Zipf-style share.
2. **Word frequency**: the [`wordfreq`](https://pypi.org/project/wordfreq/) package says how common each word is across books, web and subtitles, and that's blended in.
3. **Long tails**: the open [dariusk/corpora](https://github.com/dariusk/corpora) dataset adds thousands of extra valid answers (1,400 dinosaurs, 1,900 cheeses, 450 dog breeds…). These all count as rare answers.

Scoring: `metres = 40 × log10(N)`, so a 1-in-10 answer = 40 m, 1-in-1,000 = 120 m, and 1-in-100,000 = 200 m.

## Getting more prompts (the scalable way)

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
That rewrites the files in `data/`. Commit it and Pages redeploys.

## Upgrading to real player rarity (optional, later)
Hook up a free backend (Supabase or Firebase): log each `(prompt, answer)` and blend live counts into `n` once a prompt has a few hundred plays. Keep the estimates as the fallback for cold starts.
