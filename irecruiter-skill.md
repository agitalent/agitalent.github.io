# iRecruiter

## Purpose

iRecruiter is a routing skill for AGI Talent. It has one simple flow:

1. Register a candidate profile or a role / recruiter JD.
2. Search for a fit.
3. Switch to watch mode automatically.
4. On later visits, show only new fits since the last checkpoint.

Think of it as a router with three operations:

- `register` to write a profile or JD into the hub
- `search` to find relevant matches across the hub
- `route` to send the best match to the right side with a next action

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

## What It Does

Once connected, iRecruiter can:

- register a candidate profile
- register a role / recruiter JD
- normalize raw info into searchable records
- search the hub for relevant matches automatically
- keep watching the hub for stronger fits
- route each match to the right agent or team
- show only new fits on later visits

## Core Objects

### Profile

Use for a candidate identity.

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

### Need

Use for a role / recruiter JD.

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

### Match

Created when the router finds a meaningful fit.

Fields:

- `source_profile`
- `source_need`
- `match_score`
- `why_it_matched`
- `risk`
- `next_action`

## Storage Spec

Store registrations and matches in a hub database. A simple relational schema is enough to start.

### Tables

#### `profiles`

Stores candidate identities.

Fields:

- `id` unique record ID
- `name`
- `age`
- `email`
- `current_location`
- `highest_education_background`
- `school_graduate`
- `graduation_date`
- `current_company`
- `current_position`
- `previous_companies` JSON array
- `skills` JSON array
- `preferred_location`
- `status` active | paused | archived
- `created_at`
- `updated_at`

Indexes:

- `name`
- `location`
- `current_company`
- `current_position`
- `status`

#### `needs`

Stores roles, recruiter JDs, and hiring requests.

Fields:

- `id` unique record ID
- `role_recruiter_name`
- `company_name`
- `location`
- `position`
- `team`
- `responsibility_keywords` JSON array
- `target_companies` JSON array
- `education_degree`
- `preferred_school`
- `preferred_major`
- `qualification_keywords` JSON array
- `status` open | matched | closed
- `created_at`
- `updated_at`

Indexes:

- `role_recruiter_name`
- `company_name`
- `position`
- `team`
- `status`

#### `matches`

Stores the router output.

Fields:

- `id` unique record ID
- `source_profile_id`
- `source_need_id`
- `match_score`
- `why_it_matched`
- `risk`
- `next_action`
- `route_target`
- `status` proposed | delivered | reviewed | closed
- `created_at`
- `updated_at`

Indexes:

- `source_profile_id`
- `source_need_id`
- `match_score`
- `status`

### Storage Rules

1. Write `profiles` before searching.
2. Write `needs` before searching.
3. Create `matches` only after scoring a meaningful fit.
4. Update `status` when a record is matched, paused, or closed.
5. Keep searchable fields normalized so the hub can query them quickly.
6. Store evidence as structured arrays, not free-form blobs, when possible.

### Supabase Setup

The live site uses a free Supabase project as the hub backend.

- database schema: [`supabase-schema.sql`](/Users/owenzu/Documents/agitalent.github.io/supabase-schema.sql)
- public client access: `anon` or `publishable` key
- storage pattern: direct writes from the iRecruiter page into `profiles`, `needs`, and `matches`
- access model: public read and insert for the prototype, with row-level security enabled

### Record Lifecycle

- `active` or `open`: the record can be matched
- `matched`: the router found a strong fit and delivered it
- `paused`: temporarily excluded from search
- `closed` or `archived`: no longer eligible for new routing

## Register

Use `register` when a new candidate profile or role / recruiter JD enters the hub.

### Register Request

Candidate profile:

```md
action: register
type: profile
payload:
  name:
  age:
  email:
  current_location:
  highest_education_background:
  school_graduate:
  graduation_date:
  current_company:
  current_position:
  previous_companies:
  skills:
  preferred_location:
```

Role / recruiter JD:

```md
action: register
type: need
payload:
  role_recruiter_name:
  company_name:
  location:
  position:
  team:
  responsibility_keywords:
  target_companies:
  education_degree:
  preferred_school:
  preferred_major:
  qualification_keywords:
```

### Register Response

```md
status: success
record_id: pr_123 or nd_123
indexed_fields:
  - current_location
  - current_company
  - current_position
  - preferred_location
  - responsibility_keywords
  - qualification_keywords
next_action: search
```

## Search

Use `search` when the hub should find relevant matches.

### Search Request

```md
action: search
mode: pull | watch
query:
  location: San Francisco
  current_company: OpenAI
  current_position: research engineer
  responsibility_keywords:
    - distributed systems
    - model serving
  qualification_keywords:
    - computer science
    - machine learning
  constraints:
    - remote US
    - urgent
```

### Search Response

```md
status: success
match_count: 3
matches:
  - name_or_role: Yudong
    score: 96
    reason: Strong infra evidence and recent distributed systems work
  - name_or_role: Anthony
    score: 94
    reason: Best fit for serving and launch readiness
  - name_or_role: Jeff
    score: 91
    reason: Strong research signal, slightly less infra depth
gaps:
  - compensation not provided
  - remote policy not fully clear
next_action: route
```

## Route

Use `route` when the best match should be delivered to the right side.

### Route Request

```md
action: route
match_id: mt_123
destination: recruiter | hiring_manager | job_seeker
delivery_route:
  - email
  - hub_notification
  - internal_queue
```

### Route Response

```md
status: success
match_id: mt_123
delivered_to: hiring_manager
reason: Candidate clears the must-have technical bar
next_action: review or outreach
```

## When To Use

Use this skill when:

- a job seeker wants relevant openings without manual browsing
- a recruiter wants candidate signals matched automatically
- a hiring manager wants the hub to keep looking for fit
- the user wants the hub to keep watching and only surface new fits later

## Workflow

1. Register a candidate profile or a role / recruiter JD.
2. Normalize the record into searchable fields.
3. Search the hub for fit.
4. Switch to watch mode automatically.
5. Route the best match to the right destination.
6. Store the result as a match record.
7. On later visits, show only new fits since the last checkpoint.

## Search Modes

### Pull Mode

Use when the agent asks for a one-time search.

Behavior:

- search the hub once
- return the best matches
- explain why they were selected

### Watch Mode

Use when the agent wants the router to keep monitoring the hub.

Behavior:

- keep polling new registrations
- rerun matching when relevant records change
- remember the last seen checkpoint
- notify only when a new fit appears
- on later visits, show only new matches since the last checkpoint

## Match Scoring

Use a 0-100 score with this weighting:

- Domain fit: 35
- Evidence quality: 25
- Seniority/scope fit: 15
- Location/timing: 15
- Constraint alignment: 10

## Output Contract

```md
### Router Summary
- Registered records:
- Search mode:
- Match count:

### Ranked Matches
1. Name or role - Score
   - Why this fits:
   - Risk:
   - Route:

### Gaps
- Missing data that would improve routing

### Next Action
- Register more info / notify / keep searching / hand off
```

## Guardrails

- Do not invent candidate background.
- Do not assume availability unless stated.
- Do not confuse a recruiter JD with a hiring-manager constraint.
- Do not return a generic list when the hub supports direct routing.
- Do not stop searching if the match is weak and more registrations are likely.
- Do not expose private data beyond the intended route.

## Example Use

Input:

```md
action: register
type: profile
payload:
  name: AI engineer
  age: 29
  email: engineer@example.com
  current_location: Seattle
  highest_education_background: MS Computer Science
  school_graduate: Yes
  graduation_date: 2021-06
  current_company: Example AI Lab
  current_position: Research Engineer
  previous_companies:
    - Example Systems
    - Example Infra
  skills:
    - distributed systems
    - model serving
    - evaluation
  preferred_location: Seattle

action: register
type: need
payload:
  role_recruiter_name: Maya Chen
  company_name: Future Labs
  location: San Francisco
  position: Applied AI ML infra engineer
  team: Core platform
  responsibility_keywords:
    - distributed systems
    - model serving
  target_companies:
    - OpenAI
    - Anthropic
  education_degree: MS or PhD
  preferred_school: Stanford
  preferred_major:
    - Computer Science
    - Electrical Engineering
  qualification_keywords:
    - distributed systems
    - model serving
    - Python

action: search
mode: watch
```

Expected behavior:

- register the profile or JD
- search the hub
- enter watch mode automatically
- return the best fit or say what is missing
- on the next visit, only present new fits

## Recommended Response Style

- concise
- operational
- specific
- routing-first
- no filler
