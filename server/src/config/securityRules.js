/**
 * Security Rules Configuration
 * 
 * This file defines the security rules for the local server,
 * similar to Firebase Security Rules but implemented in code.
 * 
 * These rules are enforced by the middleware in the routes.
 */

const securityRules = {
  // User data access rules
  users: {
    // Who can read user data
    read: {
      // Players can only read their own data
      player: (requestUserId, targetUserId) => requestUserId === targetUserId,
      // Parents can read all user data
      parent: () => true
    },
    // Who can write user data
    write: {
      // Players can only update their own profile (limited fields)
      player: (requestUserId, targetUserId) => requestUserId === targetUserId,
      // Parents can update any user
      parent: () => true
    },
    // Who can delete users
    delete: {
      // Players cannot delete accounts
      player: () => false,
      // Parents can delete any account except their own
      parent: (requestUserId, targetUserId) => requestUserId !== targetUserId
    }
  },
  
  // Custom claims management
  claims: {
    // Only parents can set custom claims
    write: {
      player: () => false,
      parent: () => true
    }
  },
  
  // Game data access (for future use)
  gameData: {
    read: {
      // Players can read their own game data
      player: (requestUserId, targetUserId) => requestUserId === targetUserId,
      // Parents can read all game data (for dashboard)
      parent: () => true
    },
    write: {
      // Only players can write to game data
      player: (requestUserId, targetUserId) => requestUserId === targetUserId,
      parent: () => false
    }
  },
  
  // Radio messages (parent-to-player communication)
  radioMessages: {
    // Anyone can read messages addressed to them
    read: {
      player: (requestUserId, messageRecipient) => requestUserId === messageRecipient,
      parent: () => true
    },
    // Only parents can send radio messages
    write: {
      player: () => false,
      parent: () => true
    }
  }
};

/**
 * Check if an action is allowed based on security rules
 * 
 * @param {string} resource - The resource type (users, claims, gameData, radioMessages)
 * @param {string} action - The action (read, write, delete)
 * @param {string} role - The user's role (player, parent)
 * @param {string} requestUserId - The requesting user's ID
 * @param {string} targetId - The target resource ID
 * @returns {boolean} - Whether the action is allowed
 */
function isAllowed(resource, action, role, requestUserId, targetId) {
  const resourceRules = securityRules[resource];
  if (!resourceRules) return false;
  
  const actionRules = resourceRules[action];
  if (!actionRules) return false;
  
  const roleRule = actionRules[role];
  if (!roleRule) return false;
  
  return roleRule(requestUserId, targetId);
}

module.exports = { securityRules, isAllowed };
