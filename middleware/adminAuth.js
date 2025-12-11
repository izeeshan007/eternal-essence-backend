// middleware/adminAuth.js
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

/**
 * requireAdmin(req, res, next)
 * - Verifies a Bearer JWT and ensures admin privileges.
 * - Accepts tokens that carry { isAdmin: true } or tokens issued for an ADMIN_EMAIL
 */
export function requireAdmin(req, res, next) {
  try {
    const auth = req.headers.authorization || req.headers.Authorization || '';
    if (!auth || !auth.toString().startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Missing auth token' });
    }

    const token = auth.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      console.warn('requireAdmin: token verify failed', err?.message || err);
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    // Allow if token says isAdmin
    if (payload && payload.isAdmin) {
      req.admin = payload;
      return next();
    }

    // As a fallback if ADMIN_EMAIL is configured and token email matches, accept it
    const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (ADMIN_EMAIL && payload && payload.email && payload.email.toLowerCase() === ADMIN_EMAIL) {
      req.admin = payload;
      return next();
    }

    // Optionally if you use user documents with an isAdmin flag you could check DB here.
    return res.status(403).json({ success: false, error: 'Not an admin' });
  } catch (err) {
    console.error('requireAdmin unexpected error', err?.message || err);
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
}

// also export default for compatibility with default imports
export default requireAdmin;
