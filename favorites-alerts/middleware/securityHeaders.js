// Response headers that make the browser itself block some attacks.
// Written by hand (no extra package) so the Lambda zip stays small.
//   Content-Security-Policy      the JSON API never loads or frames anything
//   X-Content-Type-Options       the browser must not guess the content type
//   X-Frame-Options              nobody can put our responses in an iframe (clickjacking)
//   Referrer-Policy              our URLs are not sent to other sites
//   Strict-Transport-Security    only sent over HTTPS: Floci runs on plain HTTP (see limitations)
//   Cache-Control                a parent's favorites or alerts must not be cached
// Server and X-Powered-By are removed so we do not advertise Express and its version.
function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Cache-Control', 'no-store');
  if (req.secure || req.get('X-Forwarded-Proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.removeHeader('X-Powered-By');
  next();
}

module.exports = securityHeaders;
