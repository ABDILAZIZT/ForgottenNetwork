const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

function serveFrontend(app, directory) {
  const indexPath = path.join(directory, 'index.html');
  if (!fs.existsSync(indexPath)) throw new Error('Frontend build missing. Run pnpm build first.');
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }));
  app.use(
    express.static(directory, {
      index: false,
      setHeaders(res, filePath) {
        res.set(
          'Cache-Control',
          filePath.startsWith(path.join(directory, 'assets') + path.sep)
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        );
      },
    }),
  );
  app.get('*', (req, res, next) => {
    if (path.extname(req.path) || !req.accepts('html')) return next();
    res.set('Cache-Control', 'no-cache');
    return res.sendFile(indexPath);
  });
}

module.exports = { serveFrontend };
