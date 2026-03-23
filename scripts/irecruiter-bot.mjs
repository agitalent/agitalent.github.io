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
const WATCH_MODE = normalizeWatchMode(process.env.IRECRUITER_WATCH_MODE || 'all');

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
  IRECRUITER_WATCH_MODE=all|jobs|profiles
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
function normalizeWatchMode(value) {
  const normalized = normalizeText(value);
  if (normalized === 'jobs' || normalized === 'profiles') {
    return normalized;
  }
  return 'all';
}

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
    bio_link: raw.bio_link || raw.bioLink || raw.profile_link || null,
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
    company_name: raw.company_name || raw.company || raw.companyName || null,
    role_title: raw.position || raw.role_title || 'Open role',
    post_link: raw.post_link || raw.postLink || raw.job_link || null,
    team: raw.team || null,
    location: raw.location || null,
    remote: Boolean(raw.remote || /remote/i.test(String(raw.location || ''))),
    must_haves: combinedMustHaves,
    nice_to_haves: targetCompanies,
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

const insertEvent = async ({ eventType, entityType, entityId, producerAgentType, payload = {} }) => {
  const [row] = await supabaseFetch('events', {
    method: 'POST',
    body: {
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      producer_agent_type: producerAgentType || null,
      payload
    }
  });
  return row;
};

const registerProfile = async (raw) => {
  const payload = normalizeProfileInput(raw);
  const [row] = await supabaseFetch('profiles', {
    method: 'POST',
    body: payload
  });
  await insertEvent({
    eventType: 'NEW_PROFILE',
    entityType: 'profile',
    entityId: row.id,
    producerAgentType: payload.agent_type,
    payload: {
      name_or_handle: row.name_or_handle,
      location: row.location,
      bio_link: row.bio_link
    }
  });
  console.log(JSON.stringify({
    event: 'register_profile',
    id: row.id,
    name: row.name_or_handle,
    location: row.location,
    bio_link: row.bio_link,
    record: row
  }, null, 2));
  return row;
};

const registerNeed = async (raw) => {
  const payload = normalizeNeedInput(raw);
  const [row] = await supabaseFetch('needs', {
    method: 'POST',
    body: payload
  });
  await insertEvent({
    eventType: 'NEW_NEED',
    entityType: 'need',
    entityId: row.id,
    producerAgentType: 'recruiter',
    payload: {
      role_title: row.role_title,
      company_name: row.company_name,
      post_link: row.post_link,
      location: row.location
    }
  });
  console.log(JSON.stringify({
    event: 'register_need',
    id: row.id,
    role_title: row.role_title,
    contact_name: row.contact_name,
    company_name: row.company_name,
    post_link: row.post_link,
    location: row.location,
    record: row
  }, null, 2));
  return row;
};

const loadState = async () => {
  try {
    const raw = await fs.readFile(DEFAULT_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      seenNeedIds: new Set(Array.isArray(parsed.seenNeedIds) ? parsed.seenNeedIds : []),
      seenProfileIds: new Set(Array.isArray(parsed.seenProfileIds) ? parsed.seenProfileIds : []),
      seenEventIds: new Set(Array.isArray(parsed.seenEventIds) ? parsed.seenEventIds : []),
      latestNeedId: parsed.latestNeedId || null,
      latestNeedAt: parsed.latestNeedAt || null,
      latestProfileId: parsed.latestProfileId || null,
      latestProfileAt: parsed.latestProfileAt || null,
      latestEventAt: parsed.latestEventAt || null
    };
  } catch {
    return {
      seenNeedIds: new Set(),
      seenProfileIds: new Set(),
      seenEventIds: new Set(),
      latestNeedId: null,
      latestNeedAt: null,
      latestProfileId: null,
      latestProfileAt: null,
      latestEventAt: null
    };
  }
};

const saveState = async (state) => {
  await fs.mkdir(path.dirname(DEFAULT_STATE_FILE), { recursive: true });
  const payload = {
    seenNeedIds: Array.from(state.seenNeedIds).slice(-200),
    seenProfileIds: Array.from(state.seenProfileIds).slice(-200),
    seenEventIds: Array.from(state.seenEventIds).slice(-400),
    latestNeedId: state.latestNeedId,
    latestNeedAt: state.latestNeedAt,
    latestProfileId: state.latestProfileId,
    latestProfileAt: state.latestProfileAt,
    latestEventAt: state.latestEventAt
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
  const profileEducation = tokensFrom([
    profile.seniority || profileEvidence.highest_education_background || '',
    profileEvidence.school_graduate || ''
  ]);
  const needConstraints = tokensFrom(need.hiring_constraints);
  const profileLocation = normalizeText(profile.location || profileEvidence.current_location || profileEvidence.location);
  const needLocation = normalizeText(need.location);
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
  for (const term of needConstraints) {
    if (profileEducation.has(term)) score += 8;
  }
  if (profileDomain && needRole && (needRole.includes(profileDomain) || profileDomain.includes(needRole))) score += 14;

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

  await insertEvent({
    eventType: 'MATCH_CREATED',
    entityType: 'match',
    entityId: row.id,
    producerAgentType: 'router',
    payload: {
      source_profile_id: profile.id,
      source_need_id: need.id,
      match_score: score
    }
  });

  return row;
};

const fetchNeedById = async (id) => {
  const rows = await supabaseFetch('needs', {
    query: {
      select: '*',
      id: `eq.${id}`,
      limit: '1'
    }
  });
  return rows?.[0] || null;
};

const fetchProfileById = async (id) => {
  const rows = await supabaseFetch('profiles', {
    query: {
      select: '*',
      id: `eq.${id}`,
      limit: '1'
    }
  });
  return rows?.[0] || null;
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
      ...need,
      display_role_title: need.role_title || need.position || need.job_title || 'missing',
      display_company_name: need.company_name || need.contact_name || need.role_recruiter_name || 'missing',
      display_post_link: need.post_link || 'missing'
    }
  };

  console.log(JSON.stringify(event, null, 2));
  await appendInbox(event);

  let profiles = await supabaseFetch('profiles', {
    query: {
      select: '*',
      status: 'eq.active',
      order: 'created_at.desc',
      limit: '100'
    }
  });

  if (!profiles || profiles.length === 0) {
    profiles = await supabaseFetch('profiles', {
      query: {
        select: '*',
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
    need_role_title: need.role_title || need.position || need.job_title || null,
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
    profile_name: top.profile.name_or_handle,
    company_name: need.company_name || need.contact_name || need.role_recruiter_name || null,
    post_link: need.post_link || null
  };

  console.log(JSON.stringify(pushEvent, null, 2));
  await appendInbox(pushEvent);
};

const needSimilarity = (profile, need) => profileSimilarity(profile, need);

const processProfile = async (profile, state) => {
  if (!profile?.id || state.seenProfileIds.has(profile.id)) {
    return;
  }

  state.seenProfileIds.add(profile.id);
  state.latestProfileId = profile.id;
  state.latestProfileAt = profile.created_at || state.latestProfileAt;
  await saveState(state);

  const event = {
    type: 'profile_push',
    profile: {
      ...profile,
      display_name: profile.name_or_handle || 'missing',
      display_location: profile.location || 'missing',
      display_bio_link: profile.bio_link || 'missing'
    }
  };

  console.log(JSON.stringify(event, null, 2));
  await appendInbox(event);

  let needs = await supabaseFetch('needs', {
    query: {
      select: '*',
      status: 'eq.open',
      order: 'created_at.desc',
      limit: '100'
    }
  });

  if (!needs || needs.length === 0) {
    needs = await supabaseFetch('needs', {
      query: {
        select: '*',
        order: 'created_at.desc',
        limit: '100'
      }
    });
  }

  const ranked = (needs || [])
    .map((need) => ({
      need,
      score: needSimilarity(profile, need)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const debugEvent = {
    type: 'profile_match_debug',
    profile_id: profile.id,
    profile_name: profile.name_or_handle || null,
    need_count: (needs || []).length,
    ranked_count: ranked.length,
    top_score: top ? top.score : null
  };
  console.log(JSON.stringify(debugEvent, null, 2));
  await appendInbox(debugEvent);

  if (!top || top.score < MATCH_THRESHOLD) {
    const noMatchEvent = {
      type: 'no_profile_match',
      profile_id: profile.id,
      profile_name: profile.name_or_handle,
      reason: 'No open job cleared the match threshold.'
    };
    console.log(JSON.stringify(noMatchEvent, null, 2));
    await appendInbox(noMatchEvent);
    return;
  }

  const matchRow = await insertMatch(profile, top.need, top.score);
  const pushEvent = {
    type: 'profile_match_push',
    profile_id: profile.id,
    need_id: top.need.id,
    match_id: matchRow.id,
    score: top.score,
    profile_name: profile.name_or_handle,
    role_title: top.need.role_title,
    company_name: top.need.company_name || top.need.contact_name || null,
    post_link: top.need.post_link || null
  };

  console.log(JSON.stringify(pushEvent, null, 2));
  await appendInbox(pushEvent);
};

const getLatestEvents = async () => {
  const query = {
    select: '*',
    order: 'created_at.desc',
    limit: '200'
  };

  if (WATCH_MODE === 'jobs') {
    query.event_type = 'eq.NEW_NEED';
  } else if (WATCH_MODE === 'profiles') {
    query.event_type = 'eq.NEW_PROFILE';
  } else {
    query.event_type = 'in.(NEW_NEED,NEW_PROFILE)';
  }

  return supabaseFetch('events', { query });
};

const processEvent = async (event, state) => {
  if (!event?.id || state.seenEventIds.has(event.id)) {
    return;
  }

  state.seenEventIds.add(event.id);
  state.latestEventAt = event.created_at || state.latestEventAt;
  await saveState(state);

  if (event.event_type === 'NEW_NEED') {
    const need = await fetchNeedById(event.entity_id);
    if (need) {
      await processNeed(need, state);
    }
    return;
  }

  if (event.event_type === 'NEW_PROFILE') {
    const profile = await fetchProfileById(event.entity_id);
    if (profile) {
      await processProfile(profile, state);
    }
  }
};

const watchNeeds = async () => {
  ensureConfig();
  const state = await loadState();
  const latest = await getLatestEvents();

  if (state.seenEventIds.size === 0) {
    for (const row of latest || []) {
      if (row?.id) {
        state.seenEventIds.add(row.id);
      }
    }
    state.latestEventAt = latest?.[0]?.created_at || null;
    await saveState(state);
    console.log(JSON.stringify({
      type: 'watch_baseline',
      seen_events: state.seenEventIds.size,
      latest_event_at: state.latestEventAt,
      watch_mode: WATCH_MODE
    }, null, 2));
  }

  const latestNeeds = await supabaseFetch('needs', {
    query: {
      select: 'id,created_at',
      order: 'created_at.desc',
      limit: '200'
    }
  });
  if (state.seenNeedIds.size === 0) {
    for (const row of latestNeeds || []) {
      if (row?.id) {
        state.seenNeedIds.add(row.id);
      }
    }
    state.latestNeedId = latestNeeds?.[0]?.id || null;
    state.latestNeedAt = latestNeeds?.[0]?.created_at || null;
  }

  const latestProfiles = await supabaseFetch('profiles', {
    query: {
      select: 'id,created_at',
      order: 'created_at.desc',
      limit: '200'
    }
  });
  if (state.seenProfileIds.size === 0) {
    for (const row of latestProfiles || []) {
      if (row?.id) {
        state.seenProfileIds.add(row.id);
      }
    }
    state.latestProfileId = latestProfiles?.[0]?.id || null;
    state.latestProfileAt = latestProfiles?.[0]?.created_at || null;
    await saveState(state);
  }

  console.log(JSON.stringify({
    type: 'watch_started',
    poll_interval_ms: POLL_INTERVAL_MS,
    match_threshold: MATCH_THRESHOLD,
    replay_existing: false,
    watch_mode: WATCH_MODE,
    inbox_file: DEFAULT_INBOX_FILE,
    state_file: DEFAULT_STATE_FILE
  }, null, 2));

  const poll = async () => {
    const events = await getLatestEvents();
    const oldestToNewest = [...(events || [])].reverse();
    for (const event of oldestToNewest) {
      await processEvent(event, state);
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
