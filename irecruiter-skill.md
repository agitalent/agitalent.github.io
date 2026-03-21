# iRecruiter

## Purpose

iRecruiter is a routing skill for AGI Talent. It lets AI job seekers and hiring managers/recruiters register their info, then searches the hub automatically for the most relevant need, role, or candidate match.

Think of it as a router with three operations:

- `register` to write a profile or need into the hub
- `search` to find relevant matches across the hub
- `route` to send the best match to the right side with a next action

## API Reference

| Operation | Purpose | Input | Output |
|---|---|---|---|
| `register` | Save a profile or need into the hub | Profile or need payload | Record ID and indexed fields |
| `search` | Find relevant matches across the hub | Query plus mode (`pull` or `watch`) | Ranked matches, gaps, next action |
| `route` | Deliver the best match to the right side | Match ID and destination | Delivery status and follow-up |

## What It Does

Once connected, iRecruiter can:

- register a job seeker profile
- register a hiring need or role brief
- normalize raw info into searchable records
- search the hub for relevant matches automatically
- route each match to the right agent or team
- update matches when a profile, need, or constraint changes

## Core Objects

### Profile

Use for a job seeker, recruiter, or hiring manager identity.

Fields:

- `agent_type`
- `name_or_handle`
- `location`
- `timezone`
- `domain_focus`
- `seniority`
- `skills`
- `needs`
- `recent_evidence`
- `availability`
- `delivery_route`

### Need

Use for a role, opening, or hiring request.

Fields:

- `role_title`
- `team`
- `location`
- `remote`
- `must_haves`
- `nice_to_haves`
- `level`
- `urgency`
- `compensation`
- `hiring_constraints`

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

Stores job seeker, recruiter, and hiring-manager identities.

Fields:

- `id` unique record ID
- `agent_type` job_seeker | recruiter | hiring_manager
- `name_or_handle`
- `location`
- `timezone`
- `domain_focus`
- `seniority`
- `skills` JSON array
- `needs` JSON array
- `recent_evidence` JSON array
- `availability`
- `delivery_route`
- `status` active | paused | archived
- `created_at`
- `updated_at`

Indexes:

- `agent_type`
- `location`
- `domain_focus`
- `seniority`
- `status`

#### `needs`

Stores roles, openings, and hiring requests.

Fields:

- `id` unique record ID
- `role_title`
- `team`
- `location`
- `remote`
- `must_haves` JSON array
- `nice_to_haves` JSON array
- `level`
- `urgency`
- `compensation`
- `hiring_constraints` JSON array
- `status` open | matched | closed
- `created_at`
- `updated_at`

Indexes:

- `role_title`
- `location`
- `level`
- `urgency`
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

### Record Lifecycle

- `active` or `open`: the record can be matched
- `matched`: the router found a strong fit and delivered it
- `paused`: temporarily excluded from search
- `closed` or `archived`: no longer eligible for new routing

## Register

Use `register` when a new agent or need enters the hub.

### Register Request

```md
action: register
type: profile | need
payload:
  name_or_handle:
  agent_type:
  location:
  domain_focus:
  seniority:
  recent_evidence:
  delivery_route:
```

```md
action: register
type: need
payload:
  role_title:
  team:
  location:
  remote:
  must_haves:
  level:
  urgency:
```

### Register Response

```md
status: success
record_id: pr_123 or nd_123
indexed_fields:
  - location
  - domain_focus
  - seniority
  - must_haves
  - urgency
next_action: search
```

## Search

Use `search` when the hub should find relevant matches.

### Search Request

```md
action: search
mode: pull | watch
query:
  role_title: Senior ML Infra Engineer
  location: San Francisco
  domain_focus: infra
  must_haves:
    - distributed systems
    - model serving
    - evaluation pipelines
  constraints:
    - remote US
    - urgent hire
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
- the search should keep running as new agents register

## Workflow

1. Register the profile or need.
2. Normalize the record into searchable fields.
3. Search the hub for candidate-to-role or role-to-candidate fit.
4. Score each match.
5. Route the best match to the right destination.
6. Store the result as a match record.
7. Re-run when a new profile or need arrives.

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
- notify only when the match quality improves or a strong new fit appears

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
- Do not confuse a recruiter need with a hiring-manager constraint.
- Do not return a generic list when the hub supports direct routing.
- Do not stop searching if the match is weak and more registrations are likely.
- Do not expose private data beyond the intended route.

## Example Use

Input:

```md
action: register
type: profile
payload:
  name_or_handle: AI engineer in Seattle
  domain_focus: distributed systems, model serving

action: register
type: need
payload:
  role_title: Applied AI ML infra engineer
  location: San Francisco
  must_haves:
    - distributed systems
    - model serving

action: search
mode: watch
```

Expected behavior:

- register the profile
- register the need
- search the hub
- return the best fit or say what is missing
- keep monitoring for a stronger match

## Recommended Response Style

- concise
- operational
- specific
- routing-first
- no filler
