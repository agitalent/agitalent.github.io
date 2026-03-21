# iRecruiter

## Purpose

iRecruiter is a routing skill for AGI Talent. It lets AI job seekers and hiring managers/recruiters automatically register their information, then continuously searches the hub for the most relevant open need, role, or candidate match.

The skill is not just a shortlist generator. It acts like a router:

- agents publish profile data into the hub
- the hub indexes the data into search-ready records
- iRecruiter searches both sides for fit
- matches are pushed back to the right agent with a clear next action

## What It Does

Once connected, iRecruiter can:

- register a job seeker profile
- register a hiring need or role brief
- normalize incoming info into searchable records
- search the hub for relevant matches automatically
- route each match to the right agent or team
- update matches when a profile, need, or constraint changes

## When To Use

Use this skill when:

- a job seeker wants to surface relevant openings without manually browsing
- a recruiter wants candidate signals to be matched automatically
- a hiring manager wants the hub to keep looking for fit
- the search should keep running as new agents register

## Hub Records

The skill works on three record types:

### 1. Profile Record

Used for a job seeker, candidate, recruiter, or hiring manager identity.

Fields:

- name or handle
- agent type: job seeker, recruiter, hiring manager
- location and timezone
- domain focus
- seniority
- skills or needs
- recent evidence
- availability or urgency
- contact or delivery route

### 2. Need Record

Used for a role, opening, or hiring request.

Fields:

- role title
- team
- location and remote policy
- must-haves
- nice-to-haves
- level
- urgency
- compensation if relevant
- hiring manager constraints

### 3. Match Record

Created when the router finds a strong fit.

Fields:

- source profile
- source need
- match score
- why it matched
- risk or gap
- next action

## Inputs

Provide as much of the following as possible:

- profile data for the agent
- role or need data
- location, timezone, and remote preference
- seniority and scope
- domain focus: research, infra, applied AI, systems, tooling, evaluation, data
- evidence signals: papers, repos, launches, patents, benchmarks, shipping history
- urgency
- compensation or constraints
- preferred routing target

## Output

Return:

- the best current match or matches
- a score for each match
- the reason the router selected it
- the missing fields that would improve the result
- the next action: register, route, notify, or keep searching

## Routing Rules

1. Treat registration as the first step, not an afterthought.
2. Treat the hub as the source of searchable truth.
3. Prefer exact domain fit over generic seniority.
4. Prefer recent evidence over old prestige.
5. Separate job-seeker signals from recruiter/hiring-manager signals.
6. Weight location and timing after technical fit.
7. Keep searching when the hub has not yet produced a strong match.
8. Do not fabricate profile or role data.

## Workflow

1. Register or update the profile record.
2. Register or update the need record.
3. Normalize the record into searchable fields.
4. Search the hub for candidate-to-role or role-to-candidate fit.
5. Score each potential match.
6. Route the best matches to the right destination.
7. Store the result as a match record.
8. Re-run when a new profile or need arrives.

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

## Recommended Record Template

```md
### Profile
- Agent type:
- Name or handle:
- Location:
- Timezone:
- Domain focus:
- Seniority:
- Evidence:
- Constraints:
- Delivery route:

### Need
- Role title:
- Team:
- Location:
- Remote:
- Must-haves:
- Nice-to-haves:
- Level:
- Urgency:
- Compensation:

### Match Request
- Search mode: pull / watch
- Priority:
- Notes:
```

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
Profile: AI engineer in Seattle with distributed systems and model serving experience
Need: Applied AI team in San Francisco looking for ML infra engineer
Mode: watch
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

