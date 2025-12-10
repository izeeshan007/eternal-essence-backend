// middleware/auth.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js'; // example

export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ success: false, error: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Optionally fetch user:
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

    req.user = user;
    next();
  } catch (err) {
    console.error('authMiddleware err', err);
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
}

export default authMiddleware;
