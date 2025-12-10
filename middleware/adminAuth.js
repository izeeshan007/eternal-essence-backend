// middleware/adminAuth.js (ESM)
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

export default function adminAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || req.headers.Authorization;
    if (!auth || !auth.toString().startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Missing auth token' });
    }
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload || !payload.isAdmin) {
      return res.status(403).json({ success: false, error: 'Not an admin' });
    }
    // attach admin info
    req.admin = payload;
    next();
  } catch (err) {
    console.error('adminAuth error', err?.message || err);
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}
