/**
 * Create or update a user.
 *   npm run user:create -- --email you@example.com --name "Sonia" --password "…" --role admin
 *   npm run user:create -- --email mgr@example.com --name "Alex" --password "…" --role manager --clients edwards-roofing,tws-hardware
 * Admins see every client; managers/viewers only see the clients listed.
 */
import { eq, inArray } from "drizzle-orm";
import { parseArgs } from "node:util";
import { db, schema } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      password: { type: "string" },
      role: { type: "string", default: "manager" },
      clients: { type: "string" },
    },
  });
  if (!values.email || !values.password) throw new Error("--email and --password are required");
  const role = values.role as "admin" | "manager" | "viewer";
  if (!["admin", "manager", "viewer"].includes(role)) throw new Error("--role must be admin, manager or viewer");

  const d = db();
  const email = values.email.trim().toLowerCase();
  const passwordHash = await hashPassword(values.password);
  const [user] = await d
    .insert(schema.users)
    .values({ email, name: values.name || email, role, passwordHash })
    .onConflictDoUpdate({ target: schema.users.email, set: { passwordHash, role, ...(values.name ? { name: values.name } : {}) } })
    .returning();

  if (values.clients) {
    const slugs = values.clients.split(",").map((s) => s.trim());
    const clients = await d.select().from(schema.clients).where(inArray(schema.clients.slug, slugs));
    const missing = slugs.filter((s) => !clients.some((c) => c.slug === s));
    if (missing.length) throw new Error(`Unknown client slugs: ${missing.join(", ")}`);
    await d.delete(schema.userClientAccess).where(eq(schema.userClientAccess.userId, user.id));
    await d.insert(schema.userClientAccess).values(clients.map((c) => ({ userId: user.id, clientId: c.id })));
  }
  console.log(`User ${email} (${role}) saved.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
