/**
 * Seed Script - Create initial users and test data for Ali's Aigoo Apocalypse
 * 
 * Run with: npm run seed
 * 
 * Creates:
 * - Ali (player) - Full game access with mid-game progress
 * - Mom (parent) - Dashboard access only
 * - T (parent) - Dashboard access only
 * - Game progress, quiz performance, and sample messages
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { initDatabase, getDb } = require('../db/database');

// Generate invite code
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const SEED_USERS = [
  {
    id: 'test-player-ali',
    email: 'ali@aigoo.game',
    password: 'ZombieDriver2024!',
    displayName: 'Ali',
    role: 'player',
    parentName: null,
    inviteCode: 'ALI123',
    customClaims: {
      role: 'player',
      gameAccess: true,
      dashboardAccess: false,
      journey: {
        startLocation: 'NYC',
        destination: 'Spokane Valley, WA',
        totalMiles: 2800
      }
    }
  },
  {
    id: 'test-parent-mom',
    email: 'mom@aigoo.game',
    password: 'ParentWatch2024!',
    displayName: 'Mom',
    role: 'parent',
    parentName: 'Mom',
    inviteCode: null,
    customClaims: {
      role: 'parent',
      gameAccess: false,
      dashboardAccess: true,
      canSendRadioMessages: true
    }
  },
  {
    id: 'test-parent-t',
    email: 't@aigoo.game',
    password: 'ParentWatch2024!',
    displayName: 'T',
    role: 'parent',
    parentName: 'T',
    inviteCode: null,
    customClaims: {
      role: 'parent',
      gameAccess: false,
      dashboardAccess: true,
      canSendRadioMessages: true
    }
  }
];

// Sample game progress (mid-game state)
const SAMPLE_GAME_PROGRESS = {
  user_id: 'test-player-ali',
  current_mile: 1247,
  current_chapter: 3,
  total_play_time_minutes: 342,
  stress_level: 35,
  vehicle_health: 92,
  unlocked_upgrades: JSON.stringify(['rally_lights', 'all_weather_tires']),
  lovestops_visited: JSON.stringify(['nyc_start', 'pa_1', 'oh_1', 'in_1']),
  last_save_location: 'in_1',
  journey_complete: 0
};

// Sample quiz performance
const SAMPLE_QUIZ_PERFORMANCE = {
  user_id: 'test-player-ali',
  total_questions_answered: 156,
  total_correct: 129,
  overall_accuracy: 0.827,
  category_accuracy: JSON.stringify({
    road_signs: 0.92,
    right_of_way: 0.85,
    parking: 0.67,
    speed_limits: 0.88,
    emergencies: 0.79,
    maintenance: 0.75,
    defensive_driving: 0.83,
    weather: 0.80,
    night_driving: 0.78,
    sharing_road: 0.82,
    washington_laws: 0.84,
    _stats: {
      road_signs: { answered: 25, correct: 23 },
      right_of_way: { answered: 20, correct: 17 },
      parking: { answered: 12, correct: 8 },
      speed_limits: { answered: 8, correct: 7 },
      emergencies: { answered: 14, correct: 11 },
      maintenance: { answered: 16, correct: 12 },
      defensive_driving: { answered: 24, correct: 20 },
      weather: { answered: 15, correct: 12 },
      night_driving: { answered: 9, correct: 7 },
      sharing_road: { answered: 6, correct: 5 },
      washington_laws: { answered: 7, correct: 7 }
    }
  }),
  missed_questions: JSON.stringify([
    { questionId: 'chapter1_q042', timesIncorrect: 3, lastFormat: 'scenario', lastAttemptAt: '2026-01-15T14:30:00Z' },
    { questionId: 'chapter2_q118', timesIncorrect: 2, lastFormat: 'multiple_choice', lastAttemptAt: '2026-01-14T10:20:00Z' },
    { questionId: 'chapter3_q203', timesIncorrect: 1, lastFormat: 'multiple_choice', lastAttemptAt: '2026-01-16T09:45:00Z' }
  ]),
  test_simulation_scores: JSON.stringify([
    { date: '2026-01-10T15:00:00Z', score: 28, totalQuestions: 40, passed: false, durationMinutes: 25 },
    { date: '2026-01-15T16:30:00Z', score: 34, totalQuestions: 40, passed: true, durationMinutes: 22 }
  ]),
  ready_for_test_status: 'almost'
};

// Sample parent messages
const SAMPLE_MESSAGES = [
  {
    from_parent_id: 'test-parent-mom',
    from_parent_name: 'Mom',
    to_player_id: 'test-player-ali',
    message: 'Great job on the parking section! Keep practicing those parallel parking questions. Love you! 💕',
    sent_at: '2026-01-16T10:30:00Z',
    read_at: '2026-01-16T11:45:00Z',
    displayed_as_radio: 1
  },
  {
    from_parent_id: 'test-parent-t',
    from_parent_name: 'T',
    to_player_id: 'test-player-ali',
    message: 'Breaker breaker! You\'re doing awesome. Focus on the weather driving questions next. The zombies hate rain! Over and out. 🧟‍♂️🌧️',
    sent_at: '2026-01-17T08:00:00Z',
    read_at: null,
    displayed_as_radio: 0
  }
];

// Sample session logs
const SAMPLE_SESSIONS = [
  {
    user_id: 'test-player-ali',
    session_start: '2026-01-15T14:00:00Z',
    session_end: '2026-01-15T15:30:00Z',
    miles_this_session: 150,
    questions_answered_this_session: 25,
    correct_this_session: 21,
    events_triggered: JSON.stringify(['zombie_horde_1', 'kpop_radio_burst'])
  },
  {
    user_id: 'test-player-ali',
    session_start: '2026-01-16T09:00:00Z',
    session_end: '2026-01-16T10:15:00Z',
    miles_this_session: 97,
    questions_answered_this_session: 18,
    correct_this_session: 15,
    events_triggered: JSON.stringify(['lovestop_discovery'])
  }
];

async function seedUsers() {
  console.log('🌱 Seeding database...\n');
  
  // Initialize database (async with sql.js)
  await initDatabase();
  const db = getDb();
  
  // Create users
  console.log('👥 Creating users...');
  const createdUsers = {};
  
  for (const userData of SEED_USERS) {
    try {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(userData.email);
      
      if (existing) {
        console.log(`⏭️  User ${userData.email} already exists, updating...`);
        createdUsers[userData.id] = existing.id;
        continue;
      }
      
      const passwordHash = await bcrypt.hash(userData.password, 12);
      
      db.prepare(`
        INSERT INTO users (id, email, password_hash, display_name, role, parent_name, invite_code, custom_claims, email_verified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        userData.id,
        userData.email,
        passwordHash,
        userData.displayName,
        userData.role,
        userData.parentName,
        userData.inviteCode,
        JSON.stringify(userData.customClaims)
      );
      
      createdUsers[userData.id] = userData.id;
      console.log(`✅ Created ${userData.role}: ${userData.displayName} (${userData.email})`);
      
    } catch (error) {
      console.error(`❌ Failed to create ${userData.email}:`, error.message);
    }
  }
  
  // Link parents to player
  console.log('\n🔗 Linking accounts...');
  try {
    const linkExists = db.prepare('SELECT id FROM linked_accounts WHERE parent_id = ? AND player_id = ?')
      .get('test-parent-mom', 'test-player-ali');
    
    if (!linkExists) {
      db.prepare('INSERT INTO linked_accounts (id, parent_id, player_id) VALUES (?, ?, ?)')
        .run(uuidv4(), 'test-parent-mom', 'test-player-ali');
      console.log('✅ Linked Mom to Ali');
    }
    
    const linkExists2 = db.prepare('SELECT id FROM linked_accounts WHERE parent_id = ? AND player_id = ?')
      .get('test-parent-t', 'test-player-ali');
    
    if (!linkExists2) {
      db.prepare('INSERT INTO linked_accounts (id, parent_id, player_id) VALUES (?, ?, ?)')
        .run(uuidv4(), 'test-parent-t', 'test-player-ali');
      console.log('✅ Linked T to Ali');
    }
  } catch (error) {
    console.error('❌ Failed to link accounts:', error.message);
  }
  
  // Create game progress
  console.log('\n🎮 Creating game progress...');
  try {
    const progressExists = db.prepare('SELECT id FROM game_progress WHERE user_id = ?')
      .get(SAMPLE_GAME_PROGRESS.user_id);
    
    if (!progressExists) {
      db.prepare(`
        INSERT INTO game_progress (id, user_id, current_mile, current_chapter, total_play_time_minutes,
          stress_level, vehicle_health, unlocked_upgrades, lovestops_visited, last_save_location, journey_complete)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        SAMPLE_GAME_PROGRESS.user_id,
        SAMPLE_GAME_PROGRESS.current_mile,
        SAMPLE_GAME_PROGRESS.current_chapter,
        SAMPLE_GAME_PROGRESS.total_play_time_minutes,
        SAMPLE_GAME_PROGRESS.stress_level,
        SAMPLE_GAME_PROGRESS.vehicle_health,
        SAMPLE_GAME_PROGRESS.unlocked_upgrades,
        SAMPLE_GAME_PROGRESS.lovestops_visited,
        SAMPLE_GAME_PROGRESS.last_save_location,
        SAMPLE_GAME_PROGRESS.journey_complete
      );
      console.log('✅ Created game progress (Mile 1247, Chapter 3)');
    }
  } catch (error) {
    console.error('❌ Failed to create game progress:', error.message);
  }
  
  // Create quiz performance
  console.log('\n📝 Creating quiz performance...');
  try {
    const perfExists = db.prepare('SELECT id FROM quiz_performance WHERE user_id = ?')
      .get(SAMPLE_QUIZ_PERFORMANCE.user_id);
    
    if (!perfExists) {
      db.prepare(`
        INSERT INTO quiz_performance (id, user_id, total_questions_answered, total_correct,
          overall_accuracy, category_accuracy, missed_questions, test_simulation_scores, ready_for_test_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        SAMPLE_QUIZ_PERFORMANCE.user_id,
        SAMPLE_QUIZ_PERFORMANCE.total_questions_answered,
        SAMPLE_QUIZ_PERFORMANCE.total_correct,
        SAMPLE_QUIZ_PERFORMANCE.overall_accuracy,
        SAMPLE_QUIZ_PERFORMANCE.category_accuracy,
        SAMPLE_QUIZ_PERFORMANCE.missed_questions,
        SAMPLE_QUIZ_PERFORMANCE.test_simulation_scores,
        SAMPLE_QUIZ_PERFORMANCE.ready_for_test_status
      );
      console.log('✅ Created quiz performance (156 questions, 82.7% accuracy)');
    }
  } catch (error) {
    console.error('❌ Failed to create quiz performance:', error.message);
  }
  
  // Create messages
  console.log('\n📻 Creating parent messages...');
  for (const msg of SAMPLE_MESSAGES) {
    try {
      db.prepare(`
        INSERT INTO parent_messages (id, from_parent_id, from_parent_name, to_player_id, message, sent_at, read_at, displayed_as_radio)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        msg.from_parent_id,
        msg.from_parent_name,
        msg.to_player_id,
        msg.message,
        msg.sent_at,
        msg.read_at,
        msg.displayed_as_radio
      );
      console.log(`✅ Created message from ${msg.from_parent_name}`);
    } catch (error) {
      console.error(`❌ Failed to create message:`, error.message);
    }
  }
  
  // Create session logs
  console.log('\n📊 Creating session logs...');
  for (const session of SAMPLE_SESSIONS) {
    try {
      db.prepare(`
        INSERT INTO session_logs (id, user_id, session_start, session_end, miles_this_session,
          questions_answered_this_session, correct_this_session, events_triggered)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        session.user_id,
        session.session_start,
        session.session_end,
        session.miles_this_session,
        session.questions_answered_this_session,
        session.correct_this_session,
        session.events_triggered
      );
      console.log(`✅ Created session log`);
    } catch (error) {
      console.error(`❌ Failed to create session:`, error.message);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('🎮 SEED COMPLETE!\n');
  console.log('Test Credentials:');
  console.log('-'.repeat(50));
  console.log('Player (Ali):   ali@aigoo.game / ZombieDriver2024!');
  console.log('                Invite Code: ALI123');
  console.log('Parent (Mom):   mom@aigoo.game / ParentWatch2024!');
  console.log('Parent (T):     t@aigoo.game / ParentWatch2024!');
  console.log('-'.repeat(50));
  console.log('\nGame State:');
  console.log('- Journey Progress: Mile 1247 of 2800 (44%)');
  console.log('- Current Chapter: 3');
  console.log('- Quiz Accuracy: 82.7%');
  console.log('- Ready Status: Almost Ready 🟡');
  console.log('- Unread Messages: 1 (from T)');
  console.log('');
}

seedUsers().catch(console.error);
