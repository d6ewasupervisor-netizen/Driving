const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const MAX_MESSAGE_LENGTH = 500;

/**
 * Helper: Check if parent is linked to player
 */
function isLinkedToPlayer(db, parentId, playerId) {
  const link = db.prepare(`
    SELECT id FROM linked_accounts WHERE parent_id = ? AND player_id = ?
  `).get(parentId, playerId);
  return !!link;
}

/**
 * Helper: Get linked player ID for parent
 */
function getLinkedPlayerId(db, parentId) {
  const link = db.prepare(`
    SELECT player_id FROM linked_accounts WHERE parent_id = ? LIMIT 1
  `).get(parentId);
  return link?.player_id;
}

// ==========================================
// PARENT MESSAGE ROUTES (Radio Messages)
// ==========================================

/**
 * POST /api/messages/send
 * Send a message to linked player (parent only)
 */
router.post('/send', verifyToken, requireRole('parent'), (req, res) => {
  try {
    const { message, toPlayerId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ 
        error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`,
        currentLength: message.length 
      });
    }
    
    const db = getDb();
    
    // Get parent info
    const parent = db.prepare('SELECT display_name, parent_name FROM users WHERE id = ?').get(req.user.uid);
    const parentName = parent.parent_name || parent.display_name || 'Parent';
    
    // Get linked player (use provided ID or default to first linked player)
    let playerId = toPlayerId;
    if (!playerId) {
      playerId = getLinkedPlayerId(db, req.user.uid);
    }
    
    if (!playerId) {
      return res.status(404).json({ error: 'No linked player found' });
    }
    
    // Verify link
    if (!isLinkedToPlayer(db, req.user.uid, playerId)) {
      return res.status(403).json({ error: 'You are not linked to this player' });
    }
    
    // Create message
    const messageId = uuidv4();
    
    db.prepare(`
      INSERT INTO parent_messages (id, from_parent_id, from_parent_name, to_player_id, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(messageId, req.user.uid, parentName, playerId, message);
    
    res.status(201).json({
      success: true,
      messageId,
      sentAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * GET /api/messages/sent
 * Get messages sent by this parent
 */
router.get('/sent', verifyToken, requireRole('parent'), (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const db = getDb();
    
    const messages = db.prepare(`
      SELECT * FROM parent_messages 
      WHERE from_parent_id = ?
      ORDER BY sent_at DESC
      LIMIT ?
    `).all(req.user.uid, parseInt(limit));
    
    res.json({
      messages: messages.map(formatMessage)
    });
  } catch (error) {
    console.error('Get sent messages error:', error);
    res.status(500).json({ error: 'Failed to get sent messages' });
  }
});

// ==========================================
// PLAYER MESSAGE ROUTES
// ==========================================

/**
 * GET /api/messages/inbox
 * Get messages for this player
 */
router.get('/inbox', verifyToken, requireRole('player'), (req, res) => {
  try {
    const { limit = 20, includeRead = false } = req.query;
    const db = getDb();
    
    let query = `
      SELECT * FROM parent_messages 
      WHERE to_player_id = ?
    `;
    
    if (includeRead !== 'true' && includeRead !== true) {
      query += ' AND read_at IS NULL';
    }
    
    query += ' ORDER BY sent_at DESC LIMIT ?';
    
    const messages = db.prepare(query).all(req.user.uid, parseInt(limit));
    
    res.json({
      messages: messages.map(formatMessage)
    });
  } catch (error) {
    console.error('Get inbox error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

/**
 * GET /api/messages/unread-count
 * Get count of unread messages for player
 */
router.get('/unread-count', verifyToken, requireRole('player'), (req, res) => {
  try {
    const db = getDb();
    
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM parent_messages 
      WHERE to_player_id = ? AND read_at IS NULL
    `).get(req.user.uid);
    
    res.json({ unreadCount: result.count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

/**
 * POST /api/messages/:messageId/read
 * Mark a message as read (player only)
 */
router.post('/:messageId/read', verifyToken, requireRole('player'), (req, res) => {
  try {
    const { messageId } = req.params;
    const db = getDb();
    
    // Verify message belongs to player
    const message = db.prepare(`
      SELECT * FROM parent_messages WHERE id = ? AND to_player_id = ?
    `).get(messageId, req.user.uid);
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    if (message.read_at) {
      return res.json({ success: true, alreadyRead: true });
    }
    
    db.prepare(`
      UPDATE parent_messages SET read_at = datetime('now') WHERE id = ?
    `).run(messageId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

/**
 * POST /api/messages/:messageId/displayed
 * Mark a message as displayed as radio (player only)
 */
router.post('/:messageId/displayed', verifyToken, requireRole('player'), (req, res) => {
  try {
    const { messageId } = req.params;
    const db = getDb();
    
    // Verify message belongs to player
    const message = db.prepare(`
      SELECT * FROM parent_messages WHERE id = ? AND to_player_id = ?
    `).get(messageId, req.user.uid);
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    db.prepare(`
      UPDATE parent_messages SET displayed_as_radio = 1 WHERE id = ?
    `).run(messageId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Mark displayed error:', error);
    res.status(500).json({ error: 'Failed to mark message as displayed' });
  }
});

/**
 * GET /api/messages/next-radio
 * Get next message to display as radio (undisplayed messages)
 */
router.get('/next-radio', verifyToken, requireRole('player'), (req, res) => {
  try {
    const db = getDb();
    
    const message = db.prepare(`
      SELECT * FROM parent_messages 
      WHERE to_player_id = ? AND displayed_as_radio = 0
      ORDER BY sent_at ASC
      LIMIT 1
    `).get(req.user.uid);
    
    if (!message) {
      return res.json({ hasMessage: false, message: null });
    }
    
    res.json({
      hasMessage: true,
      message: formatMessage(message)
    });
  } catch (error) {
    console.error('Get next radio error:', error);
    res.status(500).json({ error: 'Failed to get next radio message' });
  }
});

// Helper function
function formatMessage(msg) {
  return {
    id: msg.id,
    fromParentId: msg.from_parent_id,
    fromParentName: msg.from_parent_name,
    toPlayerId: msg.to_player_id,
    message: msg.message,
    sentAt: msg.sent_at,
    readAt: msg.read_at,
    displayedAsRadio: !!msg.displayed_as_radio
  };
}

module.exports = router;
