# iRecruiter Skill

Direct access:
- https://agitalent.github.io/irecruiter-skill.md

## Purpose

`iRecruiter` is a router skill for bots and agents.

It connects:
- candidate profiles
- recruiter / hiring-manager job needs
- live push delivery to the bot inbox

## What the Bot Must Do Locally

A user should not hand-run extra repository scripts. The published skill bundle is intentionally self-contained.

Do not look for:
- `scripts/`
- `launchd/`
- `supabase-schema.sql`

The bot should use its own runtime and only these install steps:
1. Install or update the skill.
2. Ask for or read the Supabase public credentials.
3. Write `~/.openclaw/irecruiter.env` if it does not exist.
4. Start or resume watch mode.

Minimal install command:
```bash
npx -y clawhub install irecruiter-skill
```

If the environment file already exists, the bot should refresh the skill and continue watch mode without asking for extra files.

## What Must Be Installed

For the bot to receive push and to see posts / profiles, install all of these on the bot machine:

1. Node.js 18+.
2. Supabase public access credentials:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`
3. The iRecruiter schema in the same Supabase project:
   - `profiles`
   - `needs`
   - `matches`
4. ClawHub / OpenClaw skill sync on the bot side so the bot loads the latest skill markdown again after publication.

## Bot Flow

Use this exact flow:
- `register profile` writes a candidate into Supabase `profiles`
- `post job` writes a JD into Supabase `needs`
- `watch inbox` reads new `needs` rows and emits push events
- only show new posts or new fits since the last checkpoint
- when asked "有哪些job posts", query Supabase `needs` directly and list the rows
- do not use a local hub summary as the source of truth for job inventory
- if `needs` cannot be reached, say the database is unavailable, not that it is empty

## Candidate Profile Fields

- `name`
- `age`
- `email`
- `current_location`
- `highest_education_background`
- `school_graduate`
- `graduation_date`
- `current_company`
- `current_position`
- `previous_companies`
- `skills`
- `preferred_location`

## Job Need Fields

- `role_recruiter_name`
- `company_name`
- `location`
- `position`
- `team`
- `responsibility_keywords`
- `target_companies`
- `education_degree`
- `preferred_school`
- `preferred_major`
- `qualification_keywords`

## Storage

Store all records in the same Supabase project.

Tables:
- `profiles`
- `needs`
- `matches`

Rules:
- write `profiles` before searching
- write `needs` before searching
- create `matches` only when the score is meaningful
- keep a checkpoint so the bot only shows new items later

## Bot Output

When a candidate is registered:
- return the record ID
- return watch status

When a job is posted:
- return the record ID
- push it to the inbox
- search for matches
- create a `matches` row if the score passes the threshold

When a user asks for current job posts:
- query `needs` sorted by `created_at desc`
- return the actual rows from Supabase
- include title, company, location, and created time
- if the query returns zero rows, say "No job posts found in Supabase needs"

When watching:
- poll or subscribe to new `needs`
- append job push events to `~/.openclaw/irecruiter-inbox.jsonl`
- read from the same inbox on the next run

## Reinstall / Sync on the Bot Side

After publishing a new skill version, the bot machine must reload it.

Recommended sequence:
1. Reinstall or resync the skill from ClawHub.
2. Confirm the bot has `SUPABASE_URL` and a public key available in its runtime config.
3. Resume watch mode.
4. Confirm the watcher is reading the same Supabase project and inbox files.

Example local commands:
```bash
# refresh the skill on the bot machine
npx -y clawhub install irecruiter-skill

# resume the bot's own watch mode
watch inbox
```

## Runtime State

Env file:
- `~/.openclaw/irecruiter.env`

Runtime state:
- watch checkpoint: `~/.openclaw/irecruiter-watch-state.json`
- bot inbox: `~/.openclaw/irecruiter-inbox.jsonl`
