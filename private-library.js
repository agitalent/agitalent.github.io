(() => {
  const SUPABASE_URL = 'https://zocovvewzpqxspysanyy.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvY292dmV3enBxeHNweXNhbnl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwODYwNTgsImV4cCI6MjA4OTY2MjA1OH0.8ekfJ3bcvG-AbLD39xUINwXrpO7RiH9PVgy-xMzeHbE';
  const PAYPAL_CLIENT_ID = 'ATyMq6tHaEMTYvKmLXdrh-nesh9usI5XAf16TYeReTAQi2WSQfzBz9VyPEu4DDT1FnuH2-TUoSj6yURJ';
  const fileId = new URLSearchParams(location.search).get('file');
  if (!fileId) return;

  const call = async (name, init = {}) => {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      ...init,
      headers: { apikey: SUPABASE_ANON_KEY, ...(init.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || 'Request failed.');
    return data;
  };
  const setStatus = (message, error = false) => {
    const el = document.querySelector('#private-library-status');
    el.textContent = message;
    el.style.color = error ? '#ff9c9c' : 'rgba(239,248,244,.7)';
  };
  const loadPayPal = () => new Promise((resolve, reject) => {
    if (window.paypal) return resolve();
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(PAYPAL_CLIENT_ID)}&currency=USD&intent=capture`;
    script.onload = resolve;
    script.onerror = () => reject(new Error('PayPal could not load.'));
    document.head.append(script);
  });
  const start = async () => {
    document.body.innerHTML = `<main style="min-height:100vh;display:grid;place-items:center;padding:clamp(12px,4vw,24px);overflow-x:hidden;background:radial-gradient(circle at top left,rgba(71,229,165,.13),transparent 32%),#07110f;color:#eff8f4;font-family:system-ui,-apple-system,sans-serif"><section style="width:100%;max-width:1280px;min-width:0;border:1px solid rgba(194,255,231,.16);border-radius:24px;background:rgba(12,28,23,.92);box-shadow:0 28px 70px rgba(0,0,0,.25);overflow:hidden"><div style="padding:24px 28px;color:#47e5a5;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">AGI Talent</div><div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:0;border-top:1px solid rgba(194,255,231,.12)"><div style="min-width:0;padding:clamp(22px,5vw,64px);min-height:430px"><img id="private-library-cover" alt="" style="display:none;width:100%;max-height:360px;object-fit:cover;border-radius:16px;margin-bottom:22px;border:1px solid rgba(194,255,231,.16)"><h1 id="private-library-title" style="overflow-wrap:anywhere;font:400 clamp(2rem,6vw,4rem)/1 Georgia,serif;margin:0 0 16px">Preparing checkout…</h1><p id="private-library-description" style="white-space:pre-wrap;overflow-wrap:anywhere;color:rgba(239,248,244,.72);line-height:1.7;margin:0"></p></div><div style="align-self:start;min-width:0;padding:clamp(22px,5vw,64px);border-left:1px solid rgba(194,255,231,.12);display:flex;flex-direction:column;justify-content:flex-start"><div style="overflow-wrap:anywhere;color:#47e5a5;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px">Download file after finishing payment</div><div id="private-library-price" style="font:500 2rem Georgia,serif;margin-bottom:18px"></div><div id="private-library-action" style="width:100%;min-width:0"></div><p id="private-library-status" style="min-height:24px;margin:16px 0 0;color:rgba(239,248,244,.7)"></p></div></div></section><style>@media(max-width:700px){#private-library-cover{max-height:220px}main section>div:nth-child(2){grid-template-columns:minmax(0,1fr)!important}main section>div:nth-child(2)>div:last-child{border-left:0!important;border-top:1px solid rgba(194,255,231,.12)}#private-library-action iframe,#private-library-action>div{max-width:100%!important}}</style></main>`;
    try {
      const item = await call(`public-library?file=${encodeURIComponent(fileId)}`);
      document.querySelector('#private-library-title').textContent = item.title || 'Private file';
      document.querySelector('#private-library-description').textContent = item.description || '';
      document.querySelector('#private-library-price').textContent = `USD ${Number(item.price).toFixed(2)}`;
      if (item.coverData) { const cover = document.querySelector('#private-library-cover'); cover.src = item.coverData; cover.style.display = 'block'; }
      const action = document.querySelector('#private-library-action');
      await loadPayPal();
      window.paypal.Buttons({
        createOrder: async () => (await call('library-checkout', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'create',fileId}) })).id,
        onApprove: async (data) => { const result = await call('library-checkout', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'capture',fileId,orderId:data.orderID}) }); location.assign(result.downloadUrl); },
        onError: () => setStatus('Checkout could not be completed. Please try again later.', true)
      }).render(action);
    } catch (error) { setStatus(error.message || 'This file is unavailable.', true); }
  };
  document.addEventListener('DOMContentLoaded', start, { once: true });
})();
