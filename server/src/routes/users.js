const express = require('express');
const { getDb } = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/users
 * List all users (parent role only)
 */
router.get('/', verifyToken, requireRole('parent'), (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT id, email, display_name, role, custom_claims, email_verified, created_at, last_login
      FROM users
      ORDER BY created_at DESC
    `).all();
    
    const formattedUsers = users.map(user => ({
      uid: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      customClaims: JSON.parse(user.custom_claims || '{}'),
      emailVerified: !!user.email_verified,
      createdAt: user.created_at,
      lastLogin: user.last_login
    }));
    
    res.json({ users: formattedUsers });
    
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

/**
 * GET /api/users/:uid
 * Get a specific user (parent can view any, player can only view self)
 */
router.get('/:uid', verifyToken, (req, res) => {
  try {
    const { uid } = req.params;
    
    // Players can only view their own profile
    if (req.user.role === 'player' && req.user.uid !== uid) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const db = getDb();
    const user = db.prepare(`
      SELECT id, email, display_name, role, custom_claims, email_verified, created_at, last_login
      FROM users WHERE id = ?
    `).get(uid);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      user: {
        uid: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        customClaims: JSON.parse(user.custom_claims || '{}'),
        emailVerified: !!user.email_verified,
        createdAt: user.created_at,
        lastLogin: user.last_login
      }
    });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

/**
 * PATCH /api/users/:uid
 * Update user profile
 */
router.patch('/:uid', verifyToken, (req, res) => {
  try {
    const { uid } = req.params;
    const { displayName } = req.body;
    
    // Players can only update their own profile
    if (req.user.role === 'player' && req.user.uid !== uid) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const db = getDb();
    
    // Check user exists
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update allowed fields
    if (displayName) {
      db.prepare('UPDATE users SET display_name = ?, updated_at = datetime("now") WHERE id = ?')
        .run(displayName, uid);
    }
    
    // Fetch updated user
    const updatedUser = db.prepare(`
      SELECT id, email, display_name, role, custom_claims, email_verified
      FROM users WHERE id = ?
    `).get(uid);
    
    res.json({
      message: 'User updated',
      user: {
        uid: updatedUser.id,
        email: updatedUser.email,
        displayName: updatedUser.display_name,
        role: updatedUser.role,
        customClaims: JSON.parse(updatedUser.custom_claims || '{}')
      }
    });
    
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * POST /api/users/:uid/claims
 * Set custom claims for a user (parent role only)
 * This is the equivalent of Firebase Admin SDK setCustomUserClaims
 */
router.post('/:uid/claims', verifyToken, requireRole('parent'), (req, res) => {
  try {
    const { uid } = req.params;
    const { claims } = req.body;
    
    if (!claims || typeof claims !== 'object') {
      return res.status(400).json({ error: 'Claims must be an object' });
    }
    
    const db = getDb();
    
    // Check user exists
    const user = db.prepare('SELECT id, custom_claims FROM users WHERE id = ?').get(uid);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Merge existing claims with new claims
    const existingClaims = JSON.parse(user.custom_claims || '{}');
    const mergedClaims = { ...existingClaims, ...claims };
    
    // Update claims
    db.prepare('UPDATE users SET custom_claims = ?, updated_at = datetime("now") WHERE id = ?')
      .run(JSON.stringify(mergedClaims), uid);
    
    res.json({
      message: 'Custom claims updated',
      customClaims: mergedClaims
    });
    
  } catch (error) {
    console.error('Set claims error:', error);
    res.status(500).json({ error: 'Failed to set custom claims' });
  }
});

/**
 * PUT /api/users/:uid/role
 * Change user role (parent role only)
 */
router.put('/:uid/role', verifyToken, requireRole('parent'), (req, res) => {
  try {
    const { uid } = req.params;
    const { role } = req.body;
    
    const validRoles = ['player', 'parent'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ 
        error: 'Invalid role',
        validRoles 
      });
    }
    
    const db = getDb();
    
    // Check user exists
    const user = db.prepare('SELECT id, custom_claims FROM users WHERE id = ?').get(uid);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update role and related claims
    const existingClaims = JSON.parse(user.custom_claims || '{}');
    const updatedClaims = {
      ...existingClaims,
      role,
      gameAccess: role === 'player',
      dashboardAccess: role === 'parent'
    };
    
    db.prepare(`
      UPDATE users 
      SET role = ?, custom_claims = ?, updated_at = datetime("now") 
      WHERE id = ?
    `).run(role, JSON.stringify(updatedClaims), uid);
    
    res.json({
      message: 'User role updated',
      role,
      customClaims: updatedClaims
    });
    
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

/**
 * DELETE /api/users/:uid
 * Delete a user (parent role only, cannot delete self)
 */
router.delete('/:uid', verifyToken, requireRole('parent'), (req, res) => {
  try {
    const { uid } = req.params;
    
    // Prevent self-deletion
    if (req.user.uid === uid) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    const db = getDb();
    
    // Check user exists
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Delete user (sessions will cascade delete)
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    
    res.json({ message: 'User deleted successfully' });
    
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
