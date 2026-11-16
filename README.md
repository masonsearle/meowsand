# 🧶 Meowsand — one in a thousand, meowsand

A cat-themed, Krillion-style word game. Name a thing, and the **rarer** your answer, the further the ball of yarn rolls (with the cat in hot pursuit).

- **Daily Chase**: 7 prompts, 25 seconds each, the same for everyone that day
- **Unlimited**: endless chases, never locked behind a daily limit
- 66 prompts and **16,500+ accepted answers**, each with a "1 in N" rarity
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

## Where the answers & rarity come from
Krillion-type games measure rarity from what real players type. A static site has no players' data, so Meowsand **estimates** it:

1. **Hand-ordered lists** (`tools/categories.py`): each prompt lists answers from most to least obvious ("apple" first, "kiwano" last). Rank becomes a Zipf-style share.
2. **Word frequency**: the [`wordfreq`](https://pypi.org/project/wordfreq/) package says how common each word is across books, web and subtitles, and that's blended in.
3. **Long tails**: the open [dariusk/corpora](https://github.com/dariusk/corpora) dataset adds thousands of extra valid answers (1,400 dinosaurs, 1,900 cheeses, 450 dog breeds…). These all count as rare answers.

Scoring: `metres = 40 × log10(N)`, so a 1-in-10 answer = 40 m, 1-in-1,000 = 120 m, and 1-in-100,000 = 200 m.

## Adding prompts
Edit `tools/categories.py` (comma-separated, most common first, `a|b` for aliases), then:
```bash
pip install wordfreq
git clone --depth 1 https://github.com/dariusk/corpora.git ../corpora   # optional
python tools/build_data.py ../corpora
```
That rewrites `data/prompts.json`. Commit it and Pages redeploys.

## Upgrading to real player rarity (optional, later)
Hook up a free backend (Supabase or Firebase): log each `(prompt, answer)` and blend live counts into `n` once a prompt has a few hundred plays. Keep the estimates as the fallback for cold starts.
