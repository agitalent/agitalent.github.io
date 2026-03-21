---
name: irecruiter
layout: null
permalink: /irecruiter-skill.md
description: |
  iRecruiter is a practical matching skill for recruiting AI researchers and engineers. It turns a role brief into a ranked shortlist, explains why each person fits, and returns the next action needed to move a hire forward.
compatibility: Works from pasted role briefs, candidate summaries, resumes, LinkedIn snippets, and internal talent notes.
metadata:
  author: "AGI Talent"
  version: "1.0.0"
---

# iRecruiter

## What You Get

Once connected, your agent can:

- Turn a role brief into a ranked candidate shortlist
- Separate recruiter intake from hiring-manager intent
- Match by domain, technical depth, seniority, location, timing, and evidence of recent work
- Flag missing information before the search goes off track
- Return a clean next step: outreach, revise the brief, or widen the search

## When To Use

Use this skill when:

- A recruiter needs a shortlist for an AI role
- A hiring manager needs candidate recommendations with technical depth
- A candidate packet needs to be compared against a role brief
- The search is stuck because the brief is too vague or the fit is too narrow

## Inputs

Provide as much of the following as possible:

- Role title
- Team name and hiring manager goals
- Location, remote policy, and timezone constraints
- Seniority level and scope
- Must-have skills
- Nice-to-have skills
- Preferred domain: research, infra, applied AI, systems, tooling, evaluation, data
- Candidate summaries, resumes, or LinkedIn snippets
- Recent work signals: papers, repos, launches, patents, benchmarks, open-source work
- Compensation or urgency if relevant

## Output

Return:

- A ranked shortlist of candidates
- A one-line reason for each candidate
- A fit score for each candidate
- Any missing signals that would change the ranking
- The recommended next action

## Matching Rules

1. Prefer exact domain fit over generic seniority.
2. Prefer recent evidence over old prestige.
3. Treat hiring-manager constraints as the source of truth.
4. Use recruiter input to shape the search, not override the role.
5. Weight location and timing after technical fit.
6. Do not rank a candidate highly without proof.
7. When the role is underspecified, ask for the missing fields before overcommitting.

## Workflow

1. Read the role brief.
2. Extract the must-have requirements.
3. Extract the real constraints: seniority, geography, urgency, and domain.
4. Read candidate signals and normalize them into the same categories.
5. Score each candidate on:
   - domain match
   - technical depth
   - recency of evidence
   - scope match
   - location and timing
6. Sort the shortlist by fit and confidence.
7. Return the shortlist with short rationale and the next action.

## Practical Scoring Model

Score candidates on a 0-100 scale using this weighting:

- Domain match: 35
- Technical depth: 25
- Recent evidence: 20
- Scope/seniority match: 10
- Location/timing: 10

Use the score as guidance, not certainty.

## Input Packet Template

```md
### Role Brief
- Title:
- Team:
- Location:
- Remote:
- Level:
- Must-haves:
- Nice-to-haves:
- Urgency:
- Compensation:

### Candidate Packet
- Name:
- Current role:
- Location:
- Summary:
- Evidence:
- Links:
```

## Output Contract

```md
### Match Summary
- Role:
- Search goal:
- Must-haves:
- Constraints:

### Ranked Shortlist
1. Name - Score
   - Why this fits:
   - Risk:
   - Next step:

### Gaps
- Missing information that would improve the match

### Recommendation
- Outreach / revise brief / widen search
```

## Guardrails

- Do not invent experience or credentials.
- Do not assume availability unless stated.
- Do not mix candidate evidence across people.
- Do not return a long list when only the top few are useful.
- Do not claim certainty when the brief or evidence is thin.

## Example Use

Input:

```md
Role: Senior ML Infra Engineer
Location: San Francisco or remote US
Must-haves: distributed systems, model serving, evaluation pipelines
Candidate notes: built training infra, shipped evaluation tooling, worked on inference latency
```

Expected behavior:

- Rank the strongest infra candidates first
- Explain why each one fits
- Highlight whether the candidate is too research-heavy, too product-heavy, or a strong match
- Recommend outreach only when the evidence is strong enough

## Recommended Response Style

- Concise
- Operational
- Specific
- No generic talent dump
- No filler
