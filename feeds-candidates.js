window.createFeedsCandidates = function (client, auth, escapeHtml) {
  let revision = 0, opener = null, identity = '';
  const dialog = document.getElementById('candidate-dialog');
  const contents = document.getElementById('candidate-dialog-content');
  function close() { ++revision; if (dialog.open) dialog.close(); contents.replaceChildren(); opener?.focus(); }
  dialog.querySelector('button').addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  dialog.addEventListener('close', () => { ++revision; contents.replaceChildren(); opener?.focus(); });
  function refresh() {
    const nextIdentity = `${auth.user?.username || ''}:${auth.user?.rights || ''}`;
    if (identity !== nextIdentity) { identity = nextIdentity; close(); }
  }
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
    if (button.dataset.showCard !== 'true' || !client) return;
    opener = button; const request = ++revision;
    contents.innerHTML = '<div class="candidate-loading" role="status" aria-label="Loading"><svg aria-hidden="true" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" stroke-width="4" opacity=".2"/><path d="M22 4a18 18 0 0 1 18 18" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg></div>';
    dialog.classList.add('loading');
    dialog.showModal();
    const active = () => request === revision && dialog.open;
    const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
    let retryDelay = 1000;
    while (active()) {
    try {
      // Check the complete field as well as common separators used for multiple authors.
      const names = [...new Set([name, ...name.split(/[,;\n\/]|\s+&\s+|\s+and\s+/i)].map(value => value.trim()).filter(Boolean))];
      const source = auth.user ? 'profiles' : 'public_profile_directory';
      const columns = auth.user?.rights === 'admin' ? 'id,name_or_handle,email,location,seniority' : 'id,name_or_handle,location,seniority';
      const profiles = new Map();
      for (const candidateName of names) {
        for (let offset = 0; ; offset += 1000) {
          const pattern = candidateName.replace(/[\\%_]/g, '\\$&');
          let data;
          // Retry the same page indefinitely, preserving already retrieved matches.
          while (active()) {
            try {
              const result = await client.from(source).select(columns).ilike('name_or_handle', pattern).range(offset, offset + 999);
              if (result.error) throw result.error;
              data = result.data;
              retryDelay = 1000;
              break;
            } catch (_) {
              if (!active()) return;
              await pause(retryDelay);
              retryDelay = Math.min(retryDelay * 2, 15000);
            }
          }
          if (!active()) return;
          for (const profile of data || []) profiles.set(profile.id, profile);
          if (!data || data.length < 1000) break;
        }
      }
      if (request !== revision || !dialog.open) return;
      if (!profiles.size) { await pause(15000); continue; }
      dialog.classList.remove('loading');
      contents.innerHTML = [...profiles.values()].map(profileCard).join('');
      return;
    } catch (_) {
      if (!active()) return;
      await pause(15000);
    }
    }
  }
  return {
    refresh,
    attach(element, name, showCard = true) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'candidate-name-button';
      button.textContent = name || ''; button.dataset.showCard = String(showCard !== false); button.disabled = showCard === false;
      button.addEventListener('click', () => open(String(name || ''), button));
      element.replaceChildren(button);
    }
  };
};
