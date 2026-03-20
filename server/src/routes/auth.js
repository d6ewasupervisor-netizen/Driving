const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Role assignment rules
const ROLE_ASSIGNMENT_RULES = {
  // Specific emails get parent role
  parentEmails: ['mom@example.com', 't@example.com'],
  // Email patterns for parent role
  parentPatterns: [/parent/i, /mom/i, /dad/i],
  // Default role for new users
  defaultRole: 'player'
};

/**
 * Determine role based on email
 */
function determineRole(email) {
  const lowerEmail = email.toLowerCase();
  
  // Check specific emails
  if (ROLE_ASSIGNMENT_RULES.parentEmails.includes(lowerEmail)) {
    return 'parent';
  }
  
  // Check patterns
  for (const pattern of ROLE_ASSIGNMENT_RULES.parentPatterns) {
    if (pattern.test(email)) {
      return 'parent';
    }
  }
  
  return ROLE_ASSIGNMENT_RULES.defaultRole;
}

/**
 * Generate JWT token with custom claims
 */
function generateToken(user) {
  const customClaims = JSON.parse(user.custom_claims || '{}');
  
  return jwt.sign(
    {
      uid: user.id,
      email: user.email,
      role: user.role,
      ...customClaims
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/**
 * POST /api/auth/signup
 * Create a new user account
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const db = getDb();
    
    // Check if user already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    
    // Determine role
    const role = determineRole(email);
    
    // Create initial custom claims based on role
    const customClaims = {
      role,
      gameAccess: role === 'player',
      dashboardAccess: role === 'parent'
    };
    
    // Create user
    const userId = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO users (id, email, password_hash, display_name, role, custom_claims)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(userId, email.toLowerCase(), passwordHash, displayName || email.split('@')[0], role, JSON.stringify(customClaims));
    
    // Fetch created user
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    
    // Generate token
    const token = generateToken(user);
    
    res.status(201).json({
      message: 'Account created successfully',
      user: {
        uid: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        customClaims
      },
      token
    });
    
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

/**
 * POST /api/auth/login
 * Sign in with email and password
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const db = getDb();
    
    // Find user
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Update last login
    db.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').run(user.id);
    
    // Generate token
    const token = generateToken(user);
    const customClaims = JSON.parse(user.custom_claims || '{}');
    
    res.json({
      message: 'Login successful',
      user: {
        uid: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        customClaims
      },
      token
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info from token
 */
router.get('/me', verifyToken, (req, res) => {
  res.json({ user: req.user });
});

/**
 * POST /api/auth/refresh
 * Refresh the JWT token
 */
router.post('/refresh', verifyToken, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.uid);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const token = generateToken(user);
    
    res.json({ token });
    
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

/**
 * POST /api/auth/logout
 * Invalidate the current session (client should delete token)
 */
router.post('/logout', verifyToken, (req, res) => {
  // With JWT, logout is primarily client-side (delete the token)
  // For additional security, we could maintain a blacklist
  res.json({ message: 'Logged out successfully' });
});

/**
 * POST /api/auth/verify-email
 * Send email verification (placeholder for future implementation)
 */
router.post('/verify-email', verifyToken, (req, res) => {
  // In production, this would send an actual email
  res.json({ 
    message: 'Email verification sent',
    note: 'This is a development placeholder'
  });
});

module.exports = router;
