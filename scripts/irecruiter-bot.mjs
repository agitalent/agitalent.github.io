#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import process from 'process';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_KEY;

const DEFAULT_STATE_FILE = process.env.IRECRUITER_STATE_FILE || path.join(os.homedir(), '.openclaw', 'irecruiter-watch-state.json');
const DEFAULT_INBOX_FILE = process.env.IRECRUITER_INBOX_FILE || path.join(os.homedir(), '.openclaw', 'irecruiter-inbox.jsonl');
const POLL_INTERVAL_MS = Number(process.env.IRECRUITER_POLL_INTERVAL_MS || 15000);
const MATCH_THRESHOLD = Number(process.env.IRECRUITER_MATCH_THRESHOLD || 25);

const usage = () => {
  console.log(`Usage:
  node scripts/irecruiter-bot.mjs register-profile < profile.json
  node scripts/irecruiter-bot.mjs register-need < need.json
  node scripts/irecruiter-bot.mjs watch

Env:
  SUPABASE_URL
  SUPABASE_ANON_KEY | SUPABASE_PUBLISHABLE_KEY | SUPABASE_KEY
  IRECRUITER_STATE_FILE
  IRECRUITER_INBOX_FILE
  IRECRUITER_POLL_INTERVAL_MS
  IRECRUITER_MATCH_THRESHOLD
`);
};

const fail = (message, code = 1) => {
  console.error(message);
  process.exit(code);
};

const ensureConfig = () => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    fail('Missing SUPABASE_URL or SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY.');
  }
};

const readStdin = async () => {
  if (process.stdin.isTTY) {
    return '';
  }
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
};

const readJsonInput = async (arg) => {
  if (arg && arg !== '-') {
    const resolved = path.resolve(arg);
    const raw = await fs.readFile(resolved, 'utf8');
    return JSON.parse(raw);
  }

  const stdin = await readStdin();
  if (!stdin.trim()) {
    fail('No JSON input provided on stdin or as a file path.');
  }
  return JSON.parse(stdin);
};

const jsonHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation'
};

const supabaseFetch = async (table, options = {}) => {
  ensureConfig();
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.headers || jsonHeaders,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${options.method || 'GET'} ${table} failed (${response.status}): ${text}`);
  }

  return text ? JSON.parse(text) : null;
};

const toList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeText = (value) => String(value || '').toLowerCase().trim();

const tokensFrom = (value) => new Set(
  toList(value)
    .flatMap((item) => normalizeText(item).split(/\s+/))
    .filter(Boolean)
);

const readRecentEvidence = (row) => {
  const raw = Array.isArray(row?.recent_evidence) ? row.recent_evidence[0] : null;
  return raw && typeof raw === 'object' ? raw : {};
};

const normalizeProfileInput = (raw) => {
  const currentLocation = raw.current_location || raw.location || null;
  const skills = toList(raw.skills);
  const evidence = {
    source: 'irecruiter-bot',
    type: 'profile',
    payload: raw
  };

  return {
    agent_type: 'job_seeker',
    name_or_handle: raw.name || raw.full_name || raw.name_or_handle || raw.display_name || 'Unknown',
    email: raw.email || null,
    location: currentLocation,
    timezone: raw.timezone || null,
    domain_focus: raw.domain_focus || raw.highest_education_background || skills.slice(0, 3).join(', ') || null,
    seniority: raw.seniority || raw.current_position || raw.highest_education_background || null,
    skills,
    needs: [],
    recent_evidence: [evidence],
    availability: raw.availability || 'active',
    delivery_route: raw.delivery_route || 'hub_notification',
    status: 'active'
  };
};

const normalizeNeedInput = (raw) => {
  const responsibilityKeywords = toList(raw.responsibility_keywords);
  const qualificationKeywords = toList(raw.qualification_keywords);
  const targetCompanies = toList(raw.target_companies);
  const combinedMustHaves = Array.from(new Set([...responsibilityKeywords, ...qualificationKeywords]));

  return {
    contact_name: raw.role_recruiter_name || raw.contact_name || raw.recruiter_name || 'Unknown',
    role_title: raw.position || raw.role_title || 'Open role',
    team: raw.team || null,
    location: raw.location || null,
    remote: Boolean(raw.remote || /remote/i.test(String(raw.location || ''))),
    must_haves: combinedMustHaves,
    nice_to_haves: targetCompanies,
    level: raw.level || raw.education_degree || null,
    urgency: raw.urgency || 'Normal',
    compensation: raw.compensation || null,
    delivery_route: raw.delivery_route || 'hub_notification',
    hiring_constraints: toList([
      raw.education_degree,
      raw.preferred_school,
      raw.preferred_major
    ]),
    status: 'open'
  };
};

const registerProfile = async (raw) => {
  const payload = normalizeProfileInput(raw);
  const [row] = await supabaseFetch('profiles', {
    method: 'POST',
    body: payload
  });
  console.log(JSON.stringify({ event: 'register_profile', id: row.id, name: row.name_or_handle, location: row.location }, null, 2));
  return row;
};

const registerNeed = async (raw) => {
  const payload = normalizeNeedInput(raw);
  const [row] = await supabaseFetch('needs', {
    method: 'POST',
    body: payload
  });
  console.log(JSON.stringify({ event: 'register_need', id: row.id, role_title: row.role_title, location: row.location }, null, 2));
  return row;
};

const loadState = async () => {
  try {
    const raw = await fs.readFile(DEFAULT_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      seenNeedIds: new Set(Array.isArray(parsed.seenNeedIds) ? parsed.seenNeedIds : []),
      latestNeedId: parsed.latestNeedId || null,
      latestNeedAt: parsed.latestNeedAt || null
    };
  } catch {
    return {
      seenNeedIds: new Set(),
      latestNeedId: null,
      latestNeedAt: null
    };
  }
};

const saveState = async (state) => {
  await fs.mkdir(path.dirname(DEFAULT_STATE_FILE), { recursive: true });
  const payload = {
    seenNeedIds: Array.from(state.seenNeedIds).slice(-200),
    latestNeedId: state.latestNeedId,
    latestNeedAt: state.latestNeedAt
  };
  await fs.writeFile(DEFAULT_STATE_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const appendInbox = async (event) => {
  await fs.mkdir(path.dirname(DEFAULT_INBOX_FILE), { recursive: true });
  await fs.appendFile(DEFAULT_INBOX_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, 'utf8');
};

const profileSimilarity = (profile, need) => {
  const profileEvidence = readRecentEvidence(profile);
  const profileSkills = tokensFrom(profile.skills || profileEvidence.skills || []);
  const needMustHaves = tokensFrom(need.must_haves);
  const needNice = tokensFrom(need.nice_to_haves);
  const profileLocation = normalizeText(profile.location || profileEvidence.current_location || profileEvidence.location);
  const needLocation = normalizeText(need.location);
  const profileSeniority = normalizeText(profile.seniority || profileEvidence.current_position || profileEvidence.highest_education_background);
  const needLevel = normalizeText(need.level);
  const profileDomain = normalizeText(profile.domain_focus || profileEvidence.highest_education_background || '');
  const needRole = normalizeText(need.role_title);

  let score = 0;

  for (const term of needMustHaves) {
    if (profileSkills.has(term)) score += 18;
  }

  for (const term of needNice) {
    if (profileSkills.has(term)) score += 8;
  }

  if (profileLocation && needLocation && profileLocation === needLocation) score += 12;
  if (profileSeniority && needLevel && profileSeniority === needLevel) score += 10;
  if (profileDomain && needRole && (needRole.includes(profileDomain) || profileDomain.includes(needRole))) score += 14;
  if (need.urgency && /immediate|urgent/i.test(String(need.urgency))) score += 4;

  return Math.min(score, 100);
};

const insertMatch = async (profile, need, score) => {
  const payload = {
    source_profile_id: profile.id,
    source_need_id: need.id,
    match_score: score,
    why_it_matched: `${profile.name_or_handle || 'Candidate'} aligns with ${need.role_title || 'the role'} in the active hub.`,
    risk: 'manual review',
    next_action: 'intro_queue',
    route_target: 'recruiter',
    status: 'proposed'
  };

  const [row] = await supabaseFetch('matches', {
    method: 'POST',
    body: payload
  });

  return row;
};

const processNeed = async (need, state) => {
  if (!need?.id || state.seenNeedIds.has(need.id)) {
    return;
  }

  state.seenNeedIds.add(need.id);
  state.latestNeedId = need.id;
  state.latestNeedAt = need.created_at || state.latestNeedAt;
  await saveState(state);

  const event = {
    type: 'job_push',
    need: {
      id: need.id,
      role_title: need.role_title,
      contact_name: need.contact_name,
      team: need.team,
      location: need.location,
      must_haves: need.must_haves,
      nice_to_haves: need.nice_to_haves,
      level: need.level,
      urgency: need.urgency,
      created_at: need.created_at
    }
  };

  console.log(JSON.stringify(event, null, 2));
  await appendInbox(event);

  let profiles = await supabaseFetch('profiles', {
    query: {
      select: 'id,name_or_handle,email,location,domain_focus,seniority,skills,recent_evidence,status,created_at',
      status: 'eq.active',
      order: 'created_at.desc',
      limit: '100'
    }
  });

  if (!profiles || profiles.length === 0) {
    profiles = await supabaseFetch('profiles', {
      query: {
        select: 'id,name_or_handle,email,location,domain_focus,seniority,skills,recent_evidence,status,created_at',
        order: 'created_at.desc',
        limit: '100'
      }
    });
  }

  const ranked = (profiles || [])
    .map((profile) => ({
      profile,
      score: profileSimilarity(profile, need)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const debugEvent = {
    type: 'match_debug',
    need_id: need.id,
    profile_count: (profiles || []).length,
    ranked_count: ranked.length,
    top_score: top ? top.score : null
  };
  console.log(JSON.stringify(debugEvent, null, 2));
  await appendInbox(debugEvent);

  if (!top || top.score < MATCH_THRESHOLD) {
    const noMatchEvent = {
      type: 'no_match',
      need_id: need.id,
      role_title: need.role_title,
      reason: 'No active profile cleared the match threshold.'
    };
    console.log(JSON.stringify(noMatchEvent, null, 2));
    await appendInbox(noMatchEvent);
    return;
  }

  const matchRow = await insertMatch(top.profile, need, top.score);
  const pushEvent = {
    type: 'match_push',
    need_id: need.id,
    profile_id: top.profile.id,
    match_id: matchRow.id,
    score: top.score,
    role_title: need.role_title,
    profile_name: top.profile.name_or_handle
  };

  console.log(JSON.stringify(pushEvent, null, 2));
  await appendInbox(pushEvent);
};

const getLatestNeeds = async () => {
  return supabaseFetch('needs', {
    query: {
      select: 'id,contact_name,role_title,team,location,remote,must_haves,nice_to_haves,level,urgency,compensation,delivery_route,hiring_constraints,status,created_at',
      order: 'created_at.desc',
      limit: '50'
    }
  });
};

const watchNeeds = async () => {
  ensureConfig();
  const state = await loadState();
  const latest = await supabaseFetch('needs', {
    query: {
      select: 'id,created_at',
      order: 'created_at.desc',
      limit: '1000'
    }
  });

  if (state.seenNeedIds.size === 0) {
    for (const row of latest || []) {
      if (row?.id) {
        state.seenNeedIds.add(row.id);
      }
    }
    state.latestNeedId = latest?.[0]?.id || null;
    state.latestNeedAt = latest?.[0]?.created_at || null;
    await saveState(state);
    console.log(JSON.stringify({
      type: 'watch_baseline',
      seen_rows: state.seenNeedIds.size,
      latest_need_id: state.latestNeedId,
      latest_need_at: state.latestNeedAt
    }, null, 2));
  }

  console.log(JSON.stringify({
    type: 'watch_started',
    poll_interval_ms: POLL_INTERVAL_MS,
    match_threshold: MATCH_THRESHOLD,
    replay_existing: false,
    inbox_file: DEFAULT_INBOX_FILE,
    state_file: DEFAULT_STATE_FILE
  }, null, 2));

  const poll = async () => {
    const needs = await getLatestNeeds();
    const oldestToNewest = [...(needs || [])].reverse();
    for (const need of oldestToNewest) {
      await processNeed(need, state);
    }
  };

  await poll();
  const timer = setInterval(async () => {
    try {
      await poll();
    } catch (error) {
      console.error(JSON.stringify({ type: 'watch_error', message: error.message }, null, 2));
    }
  }, POLL_INTERVAL_MS);

  const shutdown = async () => {
    clearInterval(timer);
    await saveState(state);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

const main = async () => {
  const [, , command, arg] = process.argv;

  if (!command || command === '--help' || command === '-h') {
    usage();
    return;
  }

  if (command === 'register-profile') {
    const input = await readJsonInput(arg);
    await registerProfile(input);
    return;
  }

  if (command === 'register-need') {
    const input = await readJsonInput(arg);
    await registerNeed(input);
    return;
  }

  if (command === 'watch') {
    await watchNeeds();
    return;
  }

  usage();
  process.exitCode = 1;
};

main().catch((error) => {
  fail(error.stack || error.message);
});
