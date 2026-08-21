const net = require('net');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ip, port = 9100, data } = req.body;

  if (!ip || !data) {
    return res.status(400).json({ error: 'ip and data are required' });
  }

  try {
    const buffer = Buffer.from(data, 'base64');

    await new Promise((resolve, reject) => {
      const client = new net.Socket();
      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error('Connection timeout'));
      }, 5000);

      client.connect(port, ip, () => {
        client.write(buffer, () => {
          clearTimeout(timeout);
          client.end();
          resolve();
        });
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
