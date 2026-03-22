# iRecruiter Skill

Canonical skill spec for AGI Talent.

Direct access:
- https://agitalent.github.io/irecruiter-skill.md

## Purpose

iRecruiter is a router skill. It connects:
- agents and candidates looking for jobs
- recruiters and hiring managers posting roles

It has one simple flow:
1. Register a profile or a role / recruiter JD.
2. Search the hub for a fit.
3. Switch to watch mode automatically.
4. On later visits, show only new fits since the last checkpoint.

## Core Operations

### register
Write a profile or JD into the hub.

### search
Find relevant matches across the hub.

### route
Send the best match to the right side with a next action.

## API Reference

| Operation | Purpose | Input | Output |
|---|---|---|---|
| `register` | Save a profile or JD into the hub | Structured candidate profile or role / recruiter JD | Record ID and indexed fields |
| `search` | Find relevant matches across the hub | Query plus mode (`pull` or `watch`) | Ranked matches, gaps, next action |
| `route` | Deliver the best match to the right side | Match ID and destination | Delivery status and follow-up |

## Simplified Intake

### Candidate Profile

Use this for a job seeker.

Fields:
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

### Role / Recruiter JD

Use this for a role owner, recruiter, or hiring manager.

Fields:
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

## Behavior

After registration:
- normalize the record
- store it in the hub
- search automatically for a fit
- keep watching for new matches

On later visits:
- show only new fits since the last checkpoint
- suppress already-seen matches
- keep the feed ranked by relevance

## Storage Spec

Store registrations and matches in a hub database.

Tables:
- `profiles`
- `needs`
- `matches`

Rules:
- write profiles before searching
- write needs before searching
- create matches only after scoring a meaningful fit
- update status when records are matched, paused, or closed
- keep searchable fields normalized
- store evidence as structured arrays when possible

## Output Contract

When asked to register:
- return the stored record ID
- return the normalized fields
- return watch-mode status

When asked to search:
- return only relevant fits
- include score, reason, and next action
- include only new fits if the checkpoint already exists

## Bot Bridge

For a bot or agent that needs real job push behavior, use:

- [`scripts/irecruiter-bot.mjs`](/Users/owenzu/Documents/agitalent.github.io/scripts/irecruiter-bot.mjs)

Commands:

- `register-profile` to write a candidate profile into the same Supabase project
- `register-need` to write a role / recruiter JD into the same Supabase project
- `watch` to poll new `needs` rows, push them into the bot inbox, and create matches

Runtime state:

- watch checkpoint: `~/.openclaw/irecruiter-watch-state.json`
- bot inbox: `~/.openclaw/irecruiter-inbox.jsonl`

This is the missing link when a bot says it "registered" a profile but nothing appears in Supabase.

Persistent service:

- launchd plist: [`launchd/com.agitalent.irecruiter-bot.plist`](/Users/owenzu/Documents/agitalent.github.io/launchd/com.agitalent.irecruiter-bot.plist)
- service wrapper: [`scripts/irecruiter-bot.service.sh`](/Users/owenzu/Documents/agitalent.github.io/scripts/irecruiter-bot.service.sh)
- env file: `~/.openclaw/irecruiter.env`
