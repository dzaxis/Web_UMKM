import mysql from "mysql2/promise";
import crypto from "node:crypto";
import { hash } from "@node-rs/argon2";

const EMAIL = (process.env.ADMIN_EMAIL || "admin@bisnisinsight.test").trim().toLowerCase();
const PASSWORD = process.env.ADMIN_PASSWORD || "change-me-immediately";
const NAME = process.env.ADMIN_NAME || "Administrator Platform";
const DATABASE_URL =
  process.env.DATABASE_URL || "mysql://root@127.0.0.1:3306/bisnis_insight_analytics_db";

if (PASSWORD.length < 8) {
  throw new Error("ADMIN_PASSWORD minimal 8 karakter. Ganti sebelum dipakai di produksi.");
}

const conn = await mysql.createConnection({ uri: DATABASE_URL });
try {
  const [rows] = await conn.query("SELECT id FROM users WHERE LOWER(email)=?", [EMAIL]);

  if (Array.isArray(rows) && rows.length > 0) {
    // Idempotent: jangan timpa email yang valid. Hanya pastikan role ADMIN aktif.
    const id = rows[0].id;
    await conn.query("UPDATE users SET role=?, isActive=1, updatedAt=current_timestamp() WHERE id=?", ["ADMIN", id]);
    console.log(`Admin sudah ada: ${EMAIL} (id=${id}); peran dipastikan ADMIN.`);
  } else {
    const id = crypto.randomUUID();
    const passwordHash = await hash(PASSWORD);
    const now = new Date();
    await conn.query(
      "INSERT INTO users (id, email, name, passwordHash, role, isActive, failedLoginCount, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)",
      [id, EMAIL, NAME, passwordHash, "ADMIN", true, 0, now, now],
    );
    console.log(`Admin dibuat: ${EMAIL} (id=${id}).`);
    console.log("Segera ganti password default setelah login pertama.");
  }
} finally {
  await conn.end();
}
