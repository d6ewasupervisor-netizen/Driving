const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * Generate a random 6-character alphanumeric invite code
 */
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed similar looking chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ==========================================
// ACCOUNT LINKING ROUTES
// ==========================================

/**
 * GET /api/linking/invite-code
 * Get current invite code (player only)
 */
router.get('/invite-code', verifyToken, requireRole('player'), (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT invite_code FROM users WHERE id = ?').get(req.user.uid);
    
    if (!user.invite_code) {
      // Generate one if doesn't exist
      const code = generateInviteCode();
      db.prepare('UPDATE users SET invite_code = ? WHERE id = ?').run(code, req.user.uid);
      return res.json({ inviteCode: code });
    }
    
    res.json({ inviteCode: user.invite_code });
  } catch (error) {
    console.error('Get invite code error:', error);
    res.status(500).json({ error: 'Failed to get invite code' });
  }
});

/**
 * POST /api/linking/regenerate-code
 * Generate a new invite code (player only)
 */
router.post('/regenerate-code', verifyToken, requireRole('player'), (req, res) => {
  try {
    const db = getDb();
    const newCode = generateInviteCode();
    
    db.prepare('UPDATE users SET invite_code = ? WHERE id = ?').run(newCode, req.user.uid);
    
    res.json({ newInviteCode: newCode });
  } catch (error) {
    console.error('Regenerate code error:', error);
    res.status(500).json({ error: 'Failed to regenerate invite code' });
  }
});

/**
 * POST /api/linking/link
 * Link parent to player using invite code (parent only)
 */
router.post('/link', verifyToken, requireRole('parent'), (req, res) => {
  try {
    const { inviteCode } = req.body;
    
    if (!inviteCode) {
      return res.status(400).json({ error: 'Invite code is required' });
    }
    
    const db = getDb();
    
    // Find player with this invite code
    const player = db.prepare(`
      SELECT id, display_name, email FROM users 
      WHERE invite_code = ? AND role = 'player'
    `).get(inviteCode.toUpperCase());
    
    if (!player) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }
    
    // Check if already linked
    const existingLink = db.prepare(`
      SELECT id FROM linked_accounts WHERE parent_id = ? AND player_id = ?
    `).get(req.user.uid, player.id);
    
    if (existingLink) {
      return res.status(400).json({ error: 'Already linked to this player' });
    }
    
    // Create link
    const linkId = uuidv4();
    db.prepare(`
      INSERT INTO linked_accounts (id, parent_id, player_id) VALUES (?, ?, ?)
    `).run(linkId, req.user.uid, player.id);
    
    res.json({
      success: true,
      playerName: player.display_name,
      playerId: player.id,
      linkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Link error:', error);
    res.status(500).json({ error: 'Failed to link accounts' });
  }
});

/**
 * DELETE /api/linking/unlink/:playerId
 * Unlink parent from player (parent only)
 */
router.delete('/unlink/:playerId', verifyToken, requireRole('parent'), (req, res) => {
  try {
    const { playerId } = req.params;
    const db = getDb();
    
    const result = db.prepare(`
      DELETE FROM linked_accounts WHERE parent_id = ? AND player_id = ?
    `).run(req.user.uid, playerId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Unlink error:', error);
    res.status(500).json({ error: 'Failed to unlink accounts' });
  }
});

/**
 * GET /api/linking/linked-parents
 * Get all parents linked to this player (player only)
 */
router.get('/linked-parents', verifyToken, requireRole('player'), (req, res) => {
  try {
    const db = getDb();
    
    const links = db.prepare(`
      SELECT la.parent_id, la.linked_at, u.display_name, u.parent_name
      FROM linked_accounts la
      JOIN users u ON u.id = la.parent_id
      WHERE la.player_id = ?
    `).all(req.user.uid);
    
    res.json({
      linkedParents: links.map(link => ({
        parentId: link.parent_id,
        displayName: link.display_name,
        parentName: link.parent_name || link.display_name,
        linkedAt: link.linked_at
      }))
    });
  } catch (error) {
    console.error('Get linked parents error:', error);
    res.status(500).json({ error: 'Failed to get linked parents' });
  }
});

module.exports = router;
