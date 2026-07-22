/**
 * Cloudflare Pages Function — Proxy für die Gamma Generate API.
 *
 * Warum ein Proxy? Zwei Gründe:
 *   1. Der API-Key darf nicht im Browser stehen. Er liegt als Cloudflare-Secret
 *      GAMMA_API_KEY und verlässt den Server nie — genau wie beim claude-proxy.
 *   2. Gamma erlaubt keine Aufrufe direkt aus dem Browser (CORS).
 *
 * Ablage im Repo:  functions/gamma-proxy.js
 * Secret setzen:   Cloudflare Pages → Projekt → Settings → Environment variables
 *                  → GAMMA_API_KEY = sk-gamma-…   (Gamma: Settings → API Keys)
 *
 * Die App ruft immer POST /gamma-proxy mit einem "action"-Feld:
 *   {action:'create', payload:{…}}      → startet die Generierung, liefert generationId
 *   {action:'status', generationId:'…'} → Statusabfrage, liefert gammaUrl/exportUrl
 *   {action:'download', url:'…'}        → holt die fertige Datei und gibt sie base64 zurück
 */

const GAMMA = 'https://public-api.gamma.app/v1.0';

export async function onRequestPost(context) {
  const { request, env } = context;

  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });

  if (!env.GAMMA_API_KEY) {
    return json({ error: 'GAMMA_API_KEY ist in Cloudflare nicht gesetzt.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Ungültiger Request-Body.' }, 400);
  }

  const kopf = {
    'X-API-KEY': env.GAMMA_API_KEY,
    'Content-Type': 'application/json'
  };

  try {
    /* ---- Generierung starten ---- */
    if (body.action === 'create') {
      const r = await fetch(GAMMA + '/generations', {
        method: 'POST',
        headers: kopf,
        body: JSON.stringify(body.payload || {})
      });
      const text = await r.text();
      return new Response(text, {
        status: r.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    /* ---- Status abfragen ---- */
    if (body.action === 'status') {
      if (!body.generationId) return json({ error: 'generationId fehlt.' }, 400);
      const r = await fetch(
        GAMMA + '/generations/' + encodeURIComponent(body.generationId),
        { headers: { 'X-API-KEY': env.GAMMA_API_KEY } }
      );
      const text = await r.text();
      return new Response(text, {
        status: r.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    /* ---- Fertige Datei holen und base64 zurückgeben ----
       Die exportUrl ist signiert und läuft nach etwa einer Woche ab. Wir laden sie
       serverseitig, damit die App sie ohne CORS-Ärger in OneDrive ablegen kann.
       Sicherheitsnetz: nur Gamma-URLs, und eine Größengrenze. */
    if (body.action === 'download') {
      const url = String(body.url || '');
      if (!/^https:\/\/[a-z0-9.-]*gamma\.app\//i.test(url)) {
        return json({ error: 'Nur Gamma-URLs erlaubt.' }, 400);
      }
      const r = await fetch(url);
      if (!r.ok) return json({ error: 'Download fehlgeschlagen (' + r.status + ').' }, 502);
      const buf = await r.arrayBuffer();
      if (buf.byteLength > 25 * 1024 * 1024) {
        return json({ error: 'Datei größer als 25 MB — bitte manuell herunterladen.' }, 413);
      }
      /* In Blöcken kodieren, sonst sprengt ein großes Deck den Aufrufstack. */
      const bytes = new Uint8Array(buf);
      let roh = '';
      const block = 0x8000;
      for (let i = 0; i < bytes.length; i += block) {
        roh += String.fromCharCode.apply(null, bytes.subarray(i, i + block));
      }
      return json({
        base64: btoa(roh),
        mime: r.headers.get('content-type') || 'application/octet-stream',
        groesse: buf.byteLength
      });
    }

    return json({ error: 'Unbekannte action.' }, 400);
  } catch (e) {
    return json({ error: 'Proxy-Fehler: ' + (e && e.message ? e.message : String(e)) }, 502);
  }
}
