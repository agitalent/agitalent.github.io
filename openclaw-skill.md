# OpenClaw Skill

## Purpose
OpenClaw is a matching skill for AGI Talent. It connects recruiter and hiring-manager intent with AI researchers and engineers, then routes the best-fit candidates to the right role.

## When To Use
Use this skill when there is a hiring need, a role brief, or candidate evidence that needs to be matched directly.

## Inputs
- Hiring manager goals
- Recruiter search criteria
- Role title, level, location, and urgency
- Research signals, shipping history, repo history, and systems depth
- Candidate constraints and preferences

## Output
- A ranked list of candidate-role matches
- A clear explanation of why each match fits
- A recommendation for next action

## Matching Rules
1. Prefer exact domain fit over generic seniority.
2. Prefer candidates with evidence of recent relevant work.
3. Weight location and timing only after technical fit.
4. Flag mismatches early if the role and candidate intent are misaligned.
5. Separate recruiter input from hiring-manager intent when they conflict.

## Workflow
1. Read the role brief.
2. Extract the must-have requirements.
3. Read candidate signals from researchers and engineers.
4. Score fit by technical domain, scope, speed to hire, and location.
5. Return the top matches with short rationale.
6. Recommend outreach or revise the brief if the fit is weak.

## Skill Behavior
- Treat recruiter input as a search instruction.
- Treat hiring-manager input as the source of role truth.
- Treat researcher and engineer evidence as proof of fit.
- Keep the response concise and operational.

## Suggested Output Format
```md
### Match Summary
- Role:
- Best-fit candidates:
- Confidence:
- Why this fits:
- Next action:
```

## Guardrails
- Do not invent candidate background.
- Do not overstate confidence when evidence is thin.
- Do not blur recruiter needs and hiring-manager needs.
- Do not return a generic talent dump when a direct match is possible.

