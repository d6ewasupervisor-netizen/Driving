const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');

/**
 * Middleware to verify JWT token and attach user to request
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Fetch fresh user data
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.uid);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Parse custom claims
    const customClaims = JSON.parse(user.custom_claims || '{}');
    
    // Attach user info to request
    req.user = {
      uid: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      customClaims,
      emailVerified: !!user.email_verified
    };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Middleware to check if user has required role
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: `Required role: ${roles.join(' or ')}`
      });
    }
    
    next();
  };
}

/**
 * Middleware to check custom claims
 */
function requireClaim(claimName, claimValue = true) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const claims = req.user.customClaims || {};
    
    if (claimValue === true) {
      // Just check if claim exists and is truthy
      if (!claims[claimName]) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: `Required claim: ${claimName}`
        });
      }
    } else {
      // Check specific value
      if (claims[claimName] !== claimValue) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: `Required claim: ${claimName}=${claimValue}`
        });
      }
    }
    
    next();
  };
}

module.exports = { verifyToken, requireRole, requireClaim };
