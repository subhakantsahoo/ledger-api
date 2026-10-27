// Render's free plan puts the server to sleep after 15 minutes without traffic.
// While running on Render, the app calls its own /health every 14 minutes so it
// never reaches that limit. Render sets RENDER_EXTERNAL_URL by itself, so locally
// this does nothing.

const FOURTEEN_MINUTES = 14 * 60 * 1000;

async function pingHealth(appUrl) {
  try {
    const res = await fetch(`${appUrl}/health`);
    console.log(`keep-alive ping: ${res.status}`);
  } catch (err) {
    console.error('keep-alive ping failed:', err.message);
  }
}

function startKeepAlive() {
  const appUrl = process.env.RENDER_EXTERNAL_URL;
  if (!appUrl) return;

  setInterval(() => pingHealth(appUrl), FOURTEEN_MINUTES);
  console.log(`keep-alive: pinging ${appUrl}/health every 14 minutes`);
}

module.exports = { startKeepAlive, pingHealth };
