(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!$('viewTelegram')) return;
  const api = '/' + (location.pathname.split('/').filter(Boolean)[0] || 'knight') + '/api/telegram';
  let busy = false, loaded = false;
  const visible = () => $('viewTelegram').classList.contains('active') && document.visibilityState === 'visible';
  function message(text) { $('bktMessage').textContent = text; }
  async function request(route, body) {
    const response = await fetch(api + route, body === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-BK-Req': '1' }, body: JSON.stringify(body)
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Telegram request failed');
    }
    return response;
  }
  async function load(force = false) {
    if (busy || (!force && !visible())) return;
    busy = true;
    try {
      const data = await (await request('/status')).json();
      $('bktEngine').textContent = data.running ? 'Running · Telemt' : 'Starting · Telemt';
      $('bktUsage').textContent = ((data.usage?.total_bytes || 0) / 1073741824).toFixed(3) + ' GiB';
      $('bktConnections').textContent = data.usage?.connections ?? 'Unavailable';
      $('bktNative').textContent = data.native_note;
      $('bktLink').value = data.bridge?.tg_link || '';
      if (!loaded || force) {
        $('bktWorker').value = data.bridge?.worker_url || '';
        $('bktEnabled').checked = !!data.bridge?.enabled;
        $('bktSponsor').checked = !!data.settings?.enabled;
        $('bktTag').value = data.settings?.ad_tag || '';
        $('bktChannel').value = data.settings?.channel || '';
        loaded = true;
      }
      message(data.bridge?.enabled ? 'WEB listener enabled. Test the link in a Telegram client that supports WEB proxies; engine readiness alone does not confirm a working Telegram connection.' : 'Download and deploy your private Worker, then enter its HTTPS origin and enable the WEB bridge.');
    } catch (error) { $('bktEngine').textContent = 'Unavailable'; message(error.message); }
    finally { busy = false; }
  }
  async function action(button, operation) {
    button.disabled = true;
    try { await operation(); } catch (error) { message(error.message); }
    finally { button.disabled = false; }
  }
  $('bktDownload').addEventListener('click', event => action(event.currentTarget, async () => {
    const response = await request('/worker', {}), blob = await response.blob();
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'blue-knight-worker-private.mjs'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message('Paste the downloaded file into your own Cloudflare Worker and deploy it. Keep this file private: it contains the bridge token.');
  }));
  $('bktBridgeForm').addEventListener('submit', event => {
    event.preventDefault(); action($('bktSave'), async () => {
      message('Applying bridge settings…');
      await request('/bridge', { enabled: $('bktEnabled').checked, worker_url: $('bktWorker').value.trim(), public_ip: '' });
      await load(true);
    });
  });
  $('bktSponsorForm').addEventListener('submit', event => {
    event.preventDefault(); action($('bktSaveSponsor'), async () => {
      await request('/settings', { enabled: $('bktSponsor').checked, ad_tag: $('bktTag').value.trim(), channel: $('bktChannel').value.trim() });
      await load(true);
    });
  });
  $('bktCopy').addEventListener('click', event => action(event.currentTarget, async () => {
    if (!$('bktLink').value) throw new Error('Enable the WEB bridge first.');
    await navigator.clipboard.writeText($('bktLink').value); message('WEB proxy link copied.');
  }));
  $('bktRefresh').addEventListener('click', () => load(true));
  window.addEventListener('hashchange', () => { if (visible()) load(); });
  document.addEventListener('visibilitychange', () => { if (visible()) load(); });
  setInterval(() => load(), 10000);
  load();
})();
