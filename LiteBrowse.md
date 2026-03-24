# LiteBrowse Skill

Direct access:
- https://agitalent.github.io/LiteBrowse.md
- https://github.com/agitalent/agitalent.github.io

## Purpose

`LiteBrowse` is a low-token webpage search skill for OpenClaw.

It minimizes context size by extracting only the page sections most relevant to the current query before any answer is written.

## Install

```bash
npx -y clawhub install LiteBrowse
```

## Runtime Requirement

- Python 3
- [`scripts/web_relevance_extract.py`](/Users/owenzu/Documents/agitalent.github.io/scripts/web_relevance_extract.py)

## Default Command

```bash
python3 scripts/web_relevance_extract.py "<url-or-html-file>" "<query>" --top-k 5 --max-chars 2400 --format json
```

## What It Does

- fetches a URL or reads a local HTML file
- strips common boilerplate and non-content tags
- breaks the page into text blocks
- ranks blocks by overlap with the query
- returns only the highest-signal passages under a strict budget

## Recommended Bot Behavior

1. Convert the user's question into a compact query.
2. Run the extractor once with a small budget.
3. Answer from the returned blocks if possible.
4. Expand the budget only when the first pass is insufficient.

This should be the default path when token efficiency matters.
