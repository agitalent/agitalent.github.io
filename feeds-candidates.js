window.createFeedsCandidates = function (client, auth, escapeHtml) {
  let enabled = true, revision = 0, opener = null, identity = '';
  const toggle = document.getElementById('candidate-cards-toggle');
  const setting = document.getElementById('candidate-cards-setting');
  const settingStatus = document.getElementById('candidate-cards-status');
  const dialog = document.getElementById('candidate-dialog');
  const contents = document.getElementById('candidate-dialog-content');
  function close() { ++revision; if (dialog.open) dialog.close(); contents.replaceChildren(); opener?.focus(); }
  dialog.querySelector('button').addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  dialog.addEventListener('close', () => { ++revision; contents.replaceChildren(); opener?.focus(); });
  function refresh() {
    const nextIdentity = `${auth.user?.username || ''}:${auth.user?.rights || ''}`;
    if (identity !== nextIdentity) { identity = nextIdentity; close(); }
    setting.hidden = !auth.canManageFeeds;
    toggle.checked = enabled;
    if (!enabled) close();
    document.querySelectorAll('.candidate-name-button').forEach(button => { button.disabled = !enabled; });
  }
  async function loadSetting() {
    if (!client) return;
    const { data, error } = await client.from('feed_display_settings').select('candidate_cards_enabled').eq('id', true).maybeSingle();
    if (error) { settingStatus.textContent = 'Candidate card setting is unavailable: ' + error.message; toggle.disabled = true; }
    else { enabled = data?.candidate_cards_enabled !== false; toggle.disabled = false; settingStatus.textContent = ''; }
    refresh();
  }
  toggle.addEventListener('change', async () => {
    const next = toggle.checked; toggle.disabled = true; settingStatus.textContent = 'Saving…';
    try { await auth.setCandidateCardsEnabled(next); enabled = next; settingStatus.textContent = 'Saved.'; }
    catch (error) { settingStatus.textContent = error.message || 'Could not save the setting.'; }
    finally { toggle.disabled = false; refresh(); }
  });
  window.addEventListener('focus', loadSetting);
  function profileCard(profile) {
    const fields = [['name_or_handle', 'name_or_handle'], ['email', 'email'], ['location', 'location'], ['seniority', 'brief_background']];
    const cells = fields.map(([key, label]) => {
      const value = String(profile[key] ?? '').trim();
      if (!value) return '';
      const content = key === 'email' ? `<a href="mailto:${escapeHtml(value)}">${escapeHtml(value)}</a>` : escapeHtml(value);
      return `<div class="candidate-meta"><div class="candidate-meta-key">${escapeHtml(label)}</div><div class="candidate-meta-value">${content}</div></div>`;
    }).join('');
    return `<article class="candidate-card"><h3>${escapeHtml(profile.name_or_handle || 'Profile')}</h3><div class="candidate-field-grid">${cells}</div></article>`;
  }
  async function open(name, button) {
    if (!enabled || !client) return;
    opener = button; const request = ++revision;
    contents.textContent = 'Loading candidate profiles…';
    dialog.showModal();
    try {
      // Check the complete field as well as common separators used for multiple authors.
      const names = [...new Set([name, ...name.split(/[,;\n\/]|\s+&\s+|\s+and\s+/i)].map(value => value.trim()).filter(Boolean))];
      const source = auth.user ? 'profiles' : 'public_profile_directory';
      const columns = auth.user?.rights === 'admin' ? 'id,name_or_handle,email,location,seniority' : 'id,name_or_handle,location,seniority';
      const profiles = new Map();
      for (const candidateName of names) {
        for (let offset = 0; ; offset += 1000) {
          const pattern = candidateName.replace(/[\\%_]/g, '\\$&');
          const { data, error } = await client.from(source).select(columns).ilike('name_or_handle', pattern).range(offset, offset + 999);
          if (error) throw error;
          for (const profile of data || []) profiles.set(profile.id, profile);
          if (!data || data.length < 1000) break;
        }
      }
      if (request !== revision || !dialog.open) return;
      contents.innerHTML = profiles.size ? [...profiles.values()].map(profileCard).join('') : '<p>No matching candidate profiles found.</p>';
    } catch (error) {
      if (request === revision && dialog.open) contents.textContent = 'Could not load candidate profiles: ' + (error.message || 'Please try again.');
    }
  }
  return {
    refresh, loadSetting,
    attach(element, name) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'candidate-name-button';
      button.textContent = name || ''; button.disabled = !enabled;
      button.addEventListener('click', () => open(String(name || ''), button));
      element.replaceChildren(button);
    }
  };
};
