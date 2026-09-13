/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Create or set a user's password.
 * Usage: node scripts/set-admin-password.js <email> [--generate]
 *   plaintext password is prompted; with --generate, a strong password is
 *   created and printed once.
 */
const readline = require("readline");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

const email = process.argv[2];
const generate = process.argv.includes("--generate");

if (!email) {
  console.error("Usage: node scripts/set-admin-password.js <email> [--generate]");
  process.exit(1);
}

function generatePassword(len = 18) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

(async () => {
  const password = generate ? generatePassword() : await prompt("Password: ");
  if (!password || password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();

  const res = await client.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2 RETURNING id, email, role`,
    [hash, email]
  );
  if (res.rowCount === 0) {
    const ins = await client.query(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'super_admin')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'super_admin', updated_at = NOW()
       RETURNING id, email, role`,
      [email, hash, email.split("@")[0]]
    );
    console.log(`Created/upgraded user ${ins.rows[0].email} (${ins.rows[0].role})`);
  } else {
    console.log(`Updated password for ${res.rows[0].email} (${res.rows[0].role})`);
  }

  await client.end();
  if (generate) console.log(`New password (shown once): ${password}`);
  else console.log("Password updated.");
  console.log(`Hash: ${hash}`);
})();