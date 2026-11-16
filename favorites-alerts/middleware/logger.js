// Logs method, path, status and time. Never logs passwords, tokens or bodies.
function logger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl.split("?")[0]} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
}

module.exports = logger;
