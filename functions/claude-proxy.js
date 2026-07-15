// Sichere Zwischenstation (Cloudflare Pages Function): nimmt Anfragen von der App
// entgegen und leitet sie mit dem geheimen API-Key (aus den Cloudflare-Umgebungs-
// variablen) an Claude weiter. Der Key ist serverseitig und wird dem Browser nie sichtbar.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export async function onRequestOptions() {
  return new Response('', { status: 204, headers: cors });
}

export async function onRequestPost(context) {
  const apiKey = context.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY ist auf Cloudflare nicht gesetzt.' } }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
  try {
    const body = await context.request.text();
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: { message: 'Weiterleitung an Claude fehlgeschlagen: ' + err.message } }), {
      status: 502, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
}
