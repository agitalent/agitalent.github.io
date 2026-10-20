(() => {
  const SUPABASE_URL = 'https://zocovvewzpqxspysanyy.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvY292dmV3enBxeHNweXNhbnl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwODYwNTgsImV4cCI6MjA4OTY2MjA1OH0.8ekfJ3bcvG-AbLD39xUINwXrpO7RiH9PVgy-xMzeHbE';
  const PAYPAL_CLIENT_ID = 'ATyMq6tHaEMTYvKmLXdrh-nesh9usI5XAf16TYeReTAQi2WSQfzBz9VyPEu4DDT1FnuH2-TUoSj6yURJ';
  const fileId = new URLSearchParams(location.search).get('file');
  if (!fileId) {
    const loadCatalog = async (page = 1) => {
      const input = document.querySelector('#private-library-search');
      const query = input ? input.value.trim() : '';
      const response = await fetch(`${SUPABASE_URL}/functions/v1/public-library?catalog=1&page=${page}&q=${encodeURIComponent(query)}`, { headers: { apikey: SUPABASE_ANON_KEY } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'The library could not be loaded.');
      const results = document.querySelector('#private-library-catalog-results');
      const pagination = document.querySelector('#private-library-pagination');
      results.innerHTML = data.listings.map((item) => `<a href="checkout.html?file=${encodeURIComponent(item.id)}" style="display:block;padding:17px 18px;border:1px solid rgba(194,255,231,.16);border-radius:13px;color:#eff8f4;text-decoration:none;overflow-wrap:anywhere">${String(item.title).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a>`).join('') || '<p style="color:rgba(239,248,244,.7)">No lists match your search.</p>';
      const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
      pagination.innerHTML = `<button type="button" ${page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${totalPages} · ${data.total} list${data.total === 1 ? '' : 's'}</span><button type="button" ${page >= totalPages ? 'disabled' : ''}>Next</button>`;
      const buttons = pagination.querySelectorAll('button');
      buttons[0].addEventListener('click', () => loadCatalog(page - 1));
      buttons[1].addEventListener('click', () => loadCatalog(page + 1));
    };
    const startCatalog = () => {
      document.title = 'Discover more direct insider info';
      document.body.innerHTML = `<main style="min-height:100vh;padding:clamp(18px,5vw,60px);background:radial-gradient(circle at top left,rgba(71,229,165,.13),transparent 32%),#07110f;color:#eff8f4;font-family:system-ui,-apple-system,sans-serif"><section style="width:100%;max-width:960px;margin:auto"><div style="color:#47e5a5;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:16px">AGI Talent</div><h1 style="font:400 clamp(2rem,5vw,3.4rem)/1.1 Georgia,serif;margin:0 0 12px">Discover more direct insider info</h1><p style="color:rgba(239,248,244,.72);margin:0 0 26px">Browse available lists and securely purchase a download.</p><form id="private-library-search-form" style="display:flex;gap:10px;margin-bottom:24px"><input id="private-library-search" type="search" placeholder="Search list titles" style="flex:1;min-width:0;padding:13px 15px;border:1px solid rgba(194,255,231,.25);border-radius:10px;background:#10251e;color:#eff8f4;font:inherit"><button type="submit" style="padding:13px 18px;border:0;border-radius:10px;background:#47e5a5;color:#07110f;font-weight:700;cursor:pointer">Search</button></form><div id="private-library-catalog-results" style="display:grid;gap:10px"></div><div id="private-library-pagination" style="display:flex;align-items:center;justify-content:center;gap:14px;margin-top:24px;color:rgba(239,248,244,.72)"></div></section><style>#private-library-pagination button{padding:9px 13px;border:1px solid rgba(71,229,165,.5);border-radius:8px;background:transparent;color:#47e5a5;cursor:pointer}#private-library-pagination button:disabled{opacity:.35;cursor:default}@media(max-width:460px){#private-library-search-form{flex-direction:column}}</style></main>`;
      document.querySelector('#private-library-search-form').addEventListener('submit', (event) => { event.preventDefault(); loadCatalog(1).catch((error) => { document.querySelector('#private-library-catalog-results').textContent = error.message; }); });
      loadCatalog().catch((error) => { document.querySelector('#private-library-catalog-results').textContent = error.message; });
    };
    document.addEventListener('DOMContentLoaded', startCatalog, { once: true });
    return;
  }
  document.title = 'Discover more direct insider info';

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
  const loadCoverAfterText = async () => {
    try {
      const item = await call(`public-library?file=${encodeURIComponent(fileId)}&cover=1`);
      if (!item.coverData) return;
      const cover = document.querySelector('#private-library-cover');
      cover.src = item.coverData;
      cover.style.display = 'block';
    } catch (_) {
      // A cover is optional and must never delay or block checkout.
    }
  };
  const start = async () => {
      document.body.innerHTML = `<main style="min-height:100vh;display:grid;place-items:center;padding:clamp(12px,4vw,24px);overflow-x:hidden;background:radial-gradient(circle at top left,rgba(71,229,165,.13),transparent 32%),#07110f;color:#eff8f4;font-family:system-ui,-apple-system,sans-serif"><section style="width:100%;max-width:1280px;min-width:0;border:1px solid rgba(194,255,231,.16);border-radius:24px;background:rgba(12,28,23,.92);box-shadow:0 28px 70px rgba(0,0,0,.25);overflow:hidden"><div style="padding:24px 28px;color:#47e5a5;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">AGI Talent</div><div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:0;border-top:1px solid rgba(194,255,231,.12)"><div style="min-width:0;padding:clamp(22px,5vw,64px);min-height:430px"><img id="private-library-cover" alt="" style="display:none;width:100%;max-height:360px;object-fit:cover;border-radius:16px;margin-bottom:22px;border:1px solid rgba(194,255,231,.16)"><h1 id="private-library-title" style="overflow-wrap:anywhere;font:400 clamp(1.5rem,3vw,2rem)/1.15 Georgia,serif;margin:0 0 16px">Preparing checkout…</h1><p id="private-library-description" style="white-space:pre-wrap;overflow-wrap:anywhere;color:rgba(239,248,244,.72);line-height:1.7;margin:0"></p><button id="private-library-view-more" type="button" style="display:none;margin-top:16px;padding:10px 16px;border:1px solid rgba(71,229,165,.5);border-radius:10px;background:transparent;color:#47e5a5;cursor:pointer">View more</button></div><div style="align-self:start;min-width:0;padding:clamp(22px,5vw,64px);border-left:1px solid rgba(194,255,231,.12);display:flex;flex-direction:column;justify-content:flex-start"><div style="overflow-wrap:anywhere;color:#47e5a5;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px">Download file after finishing payment</div><div id="private-library-price" style="font:500 2rem Georgia,serif;margin-bottom:18px"></div><div id="private-library-action" style="width:100%;min-width:0"></div><a href="checkout.html" style="display:inline-block;align-self:flex-start;margin-top:18px;color:#47e5a5;text-decoration:none;font-weight:700">Most lists</a><p id="private-library-status" style="min-height:24px;margin:16px 0 0;color:rgba(239,248,244,.7)"></p></div></div></section><style>*,*:before,*:after{box-sizing:border-box}@media(max-width:700px){#private-library-cover{max-height:220px}main section{border-radius:18px}main section>div:first-child{padding:18px 20px!important}main section>div:nth-child(2){grid-template-columns:minmax(0,1fr)!important}main section>div:nth-child(2)>div:last-child{border-left:0!important;border-top:1px solid rgba(194,255,231,.12)}#private-library-action,#private-library-action iframe,#private-library-action>div{width:100%!important;max-width:100%!important;min-width:0!important}}@media(max-width:360px){main{padding:8px!important}main section{border-radius:14px}}</style></main>`;
    try {
      const item = await call(`public-library?file=${encodeURIComponent(fileId)}`);
      document.title = item.pageTitle || 'Discover more direct insider info';
      document.querySelector('#private-library-title').textContent = item.title || 'Private file';
      document.querySelector('#private-library-description').textContent = item.description || '';
      const viewMore = document.querySelector('#private-library-view-more');
      let descriptionOffset = Number(item.descriptionNextOffset || item.description.length || 0);
      viewMore.style.display = item.descriptionHasMore ? 'inline-block' : 'none';
      viewMore.addEventListener('click', async () => {
        viewMore.disabled = true;
        try {
          const next = await call(`public-library?file=${encodeURIComponent(fileId)}&offset=${descriptionOffset}`);
          document.querySelector('#private-library-description').textContent += next.description || '';
          descriptionOffset = Number(next.descriptionNextOffset || descriptionOffset);
          viewMore.style.display = next.descriptionHasMore ? 'inline-block' : 'none';
        } catch (error) { setStatus(error.message || 'More description could not be loaded.', true); }
        finally { viewMore.disabled = false; }
      });
      document.querySelector('#private-library-price').textContent = `USD ${Number(item.price).toFixed(2)}`;
      const action = document.querySelector('#private-library-action');
      if (item.hasCover) window.setTimeout(loadCoverAfterText, 0);
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
