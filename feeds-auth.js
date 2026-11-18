/* Uses the same account endpoints, session key, and Google flow as talents. */
window.createFeedsAuth = function (client, onChange) {
  const $ = id => document.getElementById(id);
  const sessionKey = 'talentsAdminSession';
  const messageType = 'agitalent-google-signup-result';
  let user = null, password = '', mode = 'password', version = 0, popup = null;
  let lastFocus = null, googlePending = false;
  const modals = ['login-modal', 'signup-modal', 'change-password-modal'];
  const normalizeCode = value => value.trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
  function status(id, text = '', error = false) {
    $(id).textContent = text;
    $(id).classList.toggle('error', error);
  }
  function close(id) {
    $(id).classList.remove('open'); $(id).setAttribute('aria-hidden', 'true');
    $(id).querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; });
    lastFocus?.focus();
  }
  function open(id) {
    lastFocus = document.activeElement;
    $(id).classList.add('open'); $(id).setAttribute('aria-hidden', 'false');
    $(id).querySelector('input')?.focus();
  }
  function accountOpen(value) {
    $('topbar-account-card').classList.toggle('open', value);
    $('topbar-username').setAttribute('aria-expanded', String(value));
  }
  function render() {
    $('topbar-auth-actions').style.display = user ? 'none' : 'inline-flex';
    $('topbar-user').style.display = user ? 'inline-flex' : 'none';
    $('topbar-username').textContent = user?.username || 'username';
    $('account-valid-date').textContent = user?.valid_from ? String(user.valid_from).slice(0, 10) : '-';
    $('account-expire-date').textContent = user?.expires_on ? String(user.expires_on).slice(0, 10) : '-';
    const type = String(user?.account_type || 'trial').toLowerCase();
    $('account-type').textContent = type.charAt(0).toUpperCase() + type.slice(1);
    if (!user) accountOpen(false);
    onChange();
  }
  function complete(data, secret = '', authMode = 'password') {
    if (!data?.username) throw new Error('Account could not be loaded.');
    const saved = { username: data.username, authMode };
    if (authMode !== 'google') saved.password = secret;
    localStorage.setItem(sessionKey, JSON.stringify(saved));
    user = data; password = secret; mode = authMode;
    render();
  }
  async function googleAccount(action) {
    const deadline = Date.now() + 15000;
    let session;
    while (Date.now() < deadline) {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      session = data?.session;
      if (session?.access_token) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!session?.access_token) throw new Error('Google authentication session did not finish in time.');
    const { data, error } = await client.functions.invoke(action === 'signup' ? 'provision-google-app-user' : 'check-google-app-user', {
      method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (error) {
      let message = error.message;
      try { const body = await error.context.json(); message = body.error || body.message || message; } catch (_) {}
      throw new Error(message);
    }
    if (!data?.username || (action === 'login' && !data.registered)) throw new Error('Please sign up first!');
    return data;
  }
  async function restore() {
    if (googlePending) return;
    const current = ++version;
    try {
      const saved = JSON.parse(localStorage.getItem(sessionKey) || 'null');
      if (!client || !saved?.username) { user = null; render(); return; }
      let data;
      if (saved.authMode === 'google') {
        data = await googleAccount('login');
      } else {
        if (!saved.password) throw new Error('Session is no longer valid.');
        const result = await client.rpc('authenticate_app_user', { p_username: saved.username, p_password: saved.password });
        if (result.error) throw result.error;
        data = result.data;
      }
      if (current !== version) return;
      if (!data?.username) throw new Error('Session is no longer valid.');
      user = data; password = saved.password || ''; mode = saved.authMode || 'password'; render();
    } catch (_) {
      if (current === version) { user = null; password = ''; render(); }
    }
  }
  async function submit(action) {
    const prefix = action === 'signup' ? 'signup-modal' : 'login-modal';
    const current = ++version;
    $(`${prefix}-submit`).disabled = true;
    status(`${prefix}-status`, action === 'signup' ? 'Creating account...' : 'Signing in...');
    try {
      if (!client) throw new Error('Supabase client failed to initialize.');
      const username = $(`${prefix}-username`).value.trim(), secret = $(`${prefix}-password`).value;
      const args = { p_username: username, p_password: secret };
      if (!username || !secret) throw new Error('Enter username and password.');
      if (action === 'signup') {
        args.p_invitation_code = normalizeCode($('signup-modal-code').value);
        if (!args.p_invitation_code) throw new Error('Enter username, password, and invitation code.');
      }
      const { data, error } = await client.rpc(action === 'signup' ? 'register_app_user_with_invitation' : 'authenticate_app_user', args);
      if (current !== version) return;
      if (error) throw error;
      complete(data, secret); close(prefix); status(`${prefix}-status`);
    } catch (error) { status(`${prefix}-status`, error.message || 'Unable to sign in.', true); }
    finally { $(`${prefix}-submit`).disabled = false; }
  }
  async function google(action) {
    if (googlePending) return;
    const prefix = action === 'signup' ? 'signup-modal' : 'login-modal';
    googlePending = true; ++version;
    $(`${prefix}-google`).disabled = true;
    status(`${prefix}-status`, 'Redirecting to Google...');
    // Open synchronously so browsers do not block the OAuth window after awaiting.
    popup = window.open('about:blank', 'agitalentGoogleAuth', 'popup=yes,width=520,height=760,left=120,top=80');
    try {
      if (!client) throw new Error('Supabase client failed to initialize.');
      const redirect = new URL('/feeds.html', location.origin);
      redirect.searchParams.set('google_signup_callback', '1');
      redirect.searchParams.set('google_auth_action', action);
      const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: {
        redirectTo: redirect.toString(), skipBrowserRedirect: true, queryParams: { prompt: 'select_account' }
      }});
      if (error) throw error;
      if (!data?.url) throw new Error('Google sign-up is not configured yet.');
      if (!popup) { location.assign(data.url); return; }
      popup.location.href = data.url;
      await new Promise((resolve, reject) => {
        const cleanup = () => { clearTimeout(timeout); clearInterval(watch); window.removeEventListener('message', message); };
        const message = async event => {
          if (event.origin !== location.origin || event.source !== popup || event.data?.type !== messageType || event.data.action !== action) return;
          cleanup();
          if (!event.data.ok) { reject(new Error(event.data.error || 'Google sign-in failed.')); return; }
          try { await restoreGoogle(); resolve(); } catch (error) { reject(error); }
        };
        const timeout = setTimeout(() => { cleanup(); reject(new Error('Google sign-up timed out. Please try again.')); }, 180000);
        const watch = setInterval(() => {
          if (popup?.closed) {
            cleanup();
            // The callback persists the session before closing, even if its message was missed.
            let saved;
            try { saved = JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch (_) {}
            if (saved?.authMode === 'google') restoreGoogle().then(resolve, reject);
            else reject(new Error('Google sign-up was closed before completion.'));
          }
        }, 400);
        window.addEventListener('message', message);
      });
      close(prefix); status(`${prefix}-status`);
    } catch (error) {
      popup?.close();
      status(`${prefix}-status`, error.message === 'Please sign up first!' ? 'Please sign up first! Use Sign Up to create your account.' : error.message, true);
    } finally { googlePending = false; $(`${prefix}-google`).disabled = false; }
  }
  async function restoreGoogle() { complete(await googleAccount('login'), '', 'google'); }
  async function callback() {
    const url = new URL(location.href);
    if (url.searchParams.get('google_signup_callback') !== '1') return false;
    const action = url.searchParams.get('google_auth_action') === 'login' ? 'login' : 'signup';
    const prefix = action === 'login' ? 'login-modal' : 'signup-modal';
    let failure;
    try {
      const params = new URLSearchParams(url.hash.slice(1));
      const error = url.searchParams.get('error_description') || params.get('error_description');
      if (error) throw new Error(error);
      if (!client) throw new Error('Supabase client failed to initialize.');
      if (url.searchParams.has('code')) {
        const { error } = await client.auth.exchangeCodeForSession(location.href);
        if (error) throw error;
      }
      complete(await googleAccount(action), '', 'google');
    } catch (error) { failure = error.message || 'Google sign-in failed.'; }
    history.replaceState({}, '', location.pathname);
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: messageType, action, ok: !failure, error: failure }, location.origin);
      window.close();
    }
    if (failure) { open(prefix); status(`${prefix}-status`, failure, true); }
    return true;
  }
  ['login', 'signup'].forEach(action => {
    const prefix = `${action}-modal`;
    $(`topbar-${action}-button`).addEventListener('click', () => {
      status(`${prefix}-status`); $(prefix).querySelectorAll('input').forEach(input => { input.value = ''; }); open(prefix);
    });
    $(`${prefix}-submit`).addEventListener('click', () => submit(action));
    $(`${prefix}-google`).addEventListener('click', () => google(action));
    $(prefix).querySelectorAll('input').forEach(input => input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); $(`${prefix}-submit`).click(); }
    }));
  });
  $('signup-modal-code').addEventListener('input', () => { $('signup-modal-code').value = normalizeCode($('signup-modal-code').value); });
  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => close(button.dataset.closeModal)));
  modals.forEach(id => $(id).addEventListener('click', event => { if (event.target === $(id)) close(id); }));
  document.addEventListener('keydown', event => {
    const active = modals.find(id => $(id).classList.contains('open'));
    if (event.key === 'Escape') { if (active) close(active); accountOpen(false); }
    if (active && event.key === 'Tab') {
      const controls = [...$(active).querySelectorAll('button:not(:disabled),input:not(:disabled)')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  $('topbar-username').addEventListener('click', () => accountOpen(!$('topbar-account-card').classList.contains('open')));
  document.addEventListener('click', event => { if (!$('topbar-user').contains(event.target)) accountOpen(false); });
  $('topbar-change-password-button').addEventListener('click', () => { accountOpen(false); status('change-password-status'); open('change-password-modal'); });
  $('change-password-submit').addEventListener('click', async () => {
    const current = $('change-password-current').value, next = $('change-password-new').value;
    if (!user || !current || !next) { status('change-password-status', 'Enter current password and new password.', true); return; }
    if (current === next) { status('change-password-status', 'New password must be different from the current password.', true); return; }
    const revision = ++version;
    $('change-password-submit').disabled = true;
    try {
      const { data, error } = await client.rpc('reset_app_user_password', { p_username: user.username, p_current_password: current, p_new_password: next });
      if (revision !== version) return;
      if (error) throw error;
      complete(data, next); close('change-password-modal');
    } catch (error) { status('change-password-status', error.message, true); }
    finally { $('change-password-submit').disabled = false; }
  });
  $('topbar-logout-button').addEventListener('click', async () => {
    ++version; user = null; password = ''; localStorage.removeItem(sessionKey); render();
    await client?.auth.signOut().catch(() => null);
  });
  window.addEventListener('storage', event => { if (event.key === sessionKey || event.key === null) restore(); });
  window.addEventListener('focus', () => restore());
  return { get user() { return user; }, async start() { render(); if (!await callback()) await restore(); } };
};
