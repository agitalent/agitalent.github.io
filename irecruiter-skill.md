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

A user should not hand-run the full stack. After the skill is installed, the bot should execute the local bootstrap flow itself.

Single bootstrap command for the bot machine:
```bash
npx -y clawhub install irecruiter-skill && \
( [ -f "$HOME/.openclaw/irecruiter.env" ] || "$HOME/Documents/agitalent.github.io/scripts/install-irecruiter-bot.sh" ) && \
launchctl kickstart -k gui/$(id -u)/com.agitalent.irecruiter-bot
```

If the environment file already exists, the bot should only refresh the skill and restart the watcher.

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
4. The iRecruiter watcher script:
   - [`scripts/irecruiter-bot.mjs`](/Users/owenzu/Documents/agitalent.github.io/scripts/irecruiter-bot.mjs)
5. The macOS persistent service files if the bot must run in the background:
   - [`scripts/install-irecruiter-bot.sh`](/Users/owenzu/Documents/agitalent.github.io/scripts/install-irecruiter-bot.sh)
   - [`scripts/irecruiter-bot.service.sh`](/Users/owenzu/Documents/agitalent.github.io/scripts/irecruiter-bot.service.sh)
   - [`launchd/com.agitalent.irecruiter-bot.plist`](/Users/owenzu/Documents/agitalent.github.io/launchd/com.agitalent.irecruiter-bot.plist)
6. ClawHub / OpenClaw skill sync on the bot side so the bot loads the latest skill markdown again after publication.

## Bot Flow

Use this exact flow:
- `register profile` writes a candidate into Supabase `profiles`
- `post job` writes a JD into Supabase `needs`
- `watch inbox` reads new `needs` rows and emits push events
- only show new posts or new fits since the last checkpoint

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

When watching:
- poll or subscribe to new `needs`
- append job push events to `~/.openclaw/irecruiter-inbox.jsonl`
- read from the same inbox on the next run

## Reinstall / Sync on the Bot Side

After publishing a new skill version, the bot machine must reload it.

Recommended sequence:
1. Reinstall or resync the skill from ClawHub.
2. Restart the iRecruiter service.
3. Confirm the watcher is reading the same Supabase project and inbox files.

Example local commands:
```bash
# refresh the skill on the bot machine
npx -y clawhub install irecruiter-skill

# restart the macOS watcher
launchctl kickstart -k gui/$(id -u)/com.agitalent.irecruiter-bot
```

## Persistent Service

Use these files to keep the bot alive on macOS:
- [`scripts/install-irecruiter-bot.sh`](/Users/owenzu/Documents/agitalent.github.io/scripts/install-irecruiter-bot.sh)
- [`scripts/irecruiter-bot.service.sh`](/Users/owenzu/Documents/agitalent.github.io/scripts/irecruiter-bot.service.sh)
- [`launchd/com.agitalent.irecruiter-bot.plist`](/Users/owenzu/Documents/agitalent.github.io/launchd/com.agitalent.irecruiter-bot.plist)

Env file:
- `~/.openclaw/irecruiter.env`

Runtime state:
- watch checkpoint: `~/.openclaw/irecruiter-watch-state.json`
- bot inbox: `~/.openclaw/irecruiter-inbox.jsonl`
