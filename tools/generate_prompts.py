"""Generate new prompt lists with Claude, in bulk.

Each line of tools/prompt_ideas.txt is a prompt ("Name a bird of prey").
For every prompt that doesn't have a list yet, this asks Claude for 60-150
valid answers ORDERED from most to least commonly said, and saves them to
tools/generated/<slug>.txt. Then run build_data.py and they're in the game.

Setup:
  pip install anthropic wordfreq
  export ANTHROPIC_API_KEY=sk-ant-...      (from console.anthropic.com)
  python tools/generate_prompts.py          # only generates missing ones
  python tools/build_data.py ../corpora

Cost: roughly 1-2p per prompt, so 1,000 new prompts costs a few pounds.
Always skim the files in tools/generated/ before publishing. Delete or edit any
list that looks wrong, and it'll be picked up on the next build.
"""
import os, re, sys, concurrent.futures as cf
import anthropic

HERE = os.path.dirname(os.path.abspath(__file__))
IDEAS = os.path.join(HERE, "prompt_ideas.txt")
OUT = os.path.join(HERE, "generated")
MODEL = os.environ.get("MEOWSAND_MODEL", "claude-sonnet-5-5")

INSTRUCTIONS = """You are building data for a word game. Players get a prompt and type ONE answer.
Rarer answers score more, so the list's ORDER is the most important thing.

Prompt: "{q}"

Write between 60 and 150 valid answers, ordered from what the MOST people would type first
(the obvious answers) down to the rarest answers that are still clearly valid.
Assume a broad English-speaking audience (UK and US).
Rules:
- Comma-separated, lowercase, on one or more lines, no numbering, no commentary.
- Put accepted alternate spellings or synonyms together with a pipe: aubergine|eggplant
- Only include answers a fair judge would accept. No jokes, no duplicates.
- If the category is small (e.g. fewer than 60 real answers), list all of them.
Output ONLY the list."""

def slug(q):
    return re.sub(r"[^a-z0-9]+", "-", q.lower()).strip("-")[:80]

def generate(client, q):
    msg = client.messages.create(
        model=MODEL, max_tokens=4000,
        messages=[{"role": "user", "content": INSTRUCTIONS.format(q=q)}],
    )
    text = "".join(b.text for b in msg.content if b.type == "text").strip()
    if text.count(",") < 20:
        raise ValueError("list too short")
    with open(os.path.join(OUT, slug(q) + ".txt"), "w", encoding="utf8") as f:
        f.write(q + "\n" + text + "\n")
    return q

def main():
    os.makedirs(OUT, exist_ok=True)
    ideas = [l.strip() for l in open(IDEAS, encoding="utf8") if l.strip() and not l.startswith("#")]
    todo = [q for q in ideas if not os.path.exists(os.path.join(OUT, slug(q) + ".txt"))]
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else len(todo)
    todo = todo[:limit]
    print(f"{len(ideas)} ideas, {len(todo)} to generate with {MODEL}")
    client = anthropic.Anthropic()
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        futs = {pool.submit(generate, client, q): q for q in todo}
        for f in cf.as_completed(futs):
            try:
                print("  ✓", f.result())
            except Exception as e:
                print("  ✗", futs[f], "->", e)

if __name__ == "__main__":
    main()
