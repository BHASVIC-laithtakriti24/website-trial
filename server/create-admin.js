// server/create-admin.js
// Usage: node server/create-admin.js "Full Name" email@example.com "StrongPass1"
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 5)) {
  console.error(`Maison Lunar needs Node.js 22.5.0 or newer — you have ${process.version}. See README.md.`);
  process.exit(1);
}
const { db } = await import('./db.js');
const { hashPassword, isValidEmail, isValidPassword } = await import('./auth.js');

const [, , fullName, email, password] = process.argv;

if (!fullName || !isValidEmail(email) || !isValidPassword(password)) {
  console.log('Usage: node server/create-admin.js "Full Name" email@example.com "StrongPass1"');
  console.log('Password must be 8+ characters with at least one letter and one number.');
  process.exit(1);
}

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
if (existing) {
  db.prepare('UPDATE users SET is_admin = 1, is_active = 1 WHERE id = ?').run(existing.id);
  console.log(`Existing user ${email} promoted to admin.`);
} else {
  const { hash, salt } = hashPassword(password);
  db.prepare(`
    INSERT INTO users (full_name, email, password_hash, password_salt, is_admin, is_active)
    VALUES (?, ?, ?, ?, 1, 1)
  `).run(fullName, email.toLowerCase(), hash, salt);
  console.log(`Admin account created for ${email}.`);
}
