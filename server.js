require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === "production";
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || "";
if (isProd && SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be at least 32 characters in production.");
}
if (!SESSION_SECRET) console.warn("WARNING: Set SESSION_SECRET in .env before public deployment.");

app.disable("x-powered-by");
// Render terminates HTTPS at its proxy; trust one proxy so secure session cookies work.
if (isProd) app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      mediaSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: isProd ? [] : null
    }
  }
}));
app.use(express.json({ limit: "100kb", verify: (req, res, buf) => { req.rawBody = Buffer.from(buf); } }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

const dataDir = path.resolve(path.dirname(process.env.DATABASE_FILE || "./data/maa-kalawati.sqlite"));
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.resolve(process.env.DATABASE_FILE || "./data/maa-kalawati.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 phone TEXT DEFAULT '',
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','staff','customer')),
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS customers (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
 name TEXT NOT NULL,
 phone TEXT NOT NULL,
 email TEXT DEFAULT '',
 consent_whatsapp INTEGER NOT NULL DEFAULT 0,
 notes TEXT DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS enquiries (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
 name TEXT NOT NULL,
 phone TEXT NOT NULL,
 email TEXT DEFAULT '',
 product TEXT DEFAULT '',
 message TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','replied','closed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 category TEXT DEFAULT '',
 price REAL,
 description TEXT DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
 customer_name TEXT NOT NULL,
 customer_phone TEXT NOT NULL,
 items_json TEXT NOT NULL DEFAULT '[]',
 total REAL NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','confirmed','processing','ready','delivered','cancelled')),
 payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','refunded')),
 notes TEXT DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
 phone TEXT NOT NULL,
 direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
 channel TEXT NOT NULL CHECK(channel IN ('website','whatsapp')),
 body TEXT NOT NULL,
 provider_message_id TEXT DEFAULT '',
 status TEXT NOT NULL DEFAULT 'logged',
 created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 action TEXT NOT NULL,
 entity TEXT DEFAULT '',
 entity_id INTEGER,
 ip TEXT DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS page_views (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 path TEXT NOT NULL,
 session_key TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_views_created ON page_views(created_at);
`);

function audit(req, action, entity = "", entityId = null) {
  try {
    db.prepare("INSERT INTO audit_logs(user_id,action,entity,entity_id,ip) VALUES(?,?,?,?,?)")
      .run(req.user?.id || null, action, entity, entityId, req.ip || "");
  } catch (_) {}
}
function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "").slice(0, 20);
}
function validPhone(phone) {
  return /^\+?[0-9]{8,15}$/.test(normalizePhone(phone));
}
function cleanText(value, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}
function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role };
}
function ensureCustomer({ name, phone, email = "", userId = null, consent = false }) {
  const normalized = normalizePhone(phone);
  let existing = db.prepare("SELECT * FROM customers WHERE phone=? ORDER BY id LIMIT 1").get(normalized);
  if (existing) {
    if (userId && !existing.user_id) db.prepare("UPDATE customers SET user_id=? WHERE id=?").run(userId, existing.id);
    return existing.id;
  }
  const info = db.prepare("INSERT INTO customers(user_id,name,phone,email,consent_whatsapp) VALUES(?,?,?,?,?)")
    .run(userId, cleanText(name, 100), normalized, cleanText(email, 160), consent ? 1 : 0);
  return Number(info.lastInsertRowid);
}
function createUser({ name, email, phone = "", password, role }) {
  const hash = bcrypt.hashSync(password, 12);
  const result = db.prepare("INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)")
    .run(cleanText(name, 100), cleanText(email, 160).toLowerCase(), normalizePhone(phone), hash, role);
  return Number(result.lastInsertRowid);
}
if (process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD) {
  const owner = db.prepare("SELECT id FROM users WHERE email=?").get(process.env.OWNER_EMAIL.toLowerCase());
  if (!owner) {
    const id = createUser({
      name: process.env.OWNER_NAME || "Store Owner",
      email: process.env.OWNER_EMAIL,
      password: process.env.OWNER_PASSWORD,
      role: "owner"
    });
    console.log(`Initial owner account created (user id ${id}). Change credentials after first login.`);
  }
}

app.use(session({
  name: "mke.sid",
  store: new SQLiteStore({
    db: "sessions.sqlite",
    dir: dataDir,
    table: "sessions",
    concurrentDB: true
  }),
  secret: SESSION_SECRET || crypto.randomBytes(48).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: isProd, sameSite: "strict", maxAge: 8 * 60 * 60 * 1000 }
}));
app.use((req, res, next) => {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });
function requireCsrf(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const supplied = req.get("x-csrf-token");
  if (!supplied || !req.session.csrfToken || supplied.length !== req.session.csrfToken.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(req.session.csrfToken))) {
    return res.status(403).json({ error: "Security token expired. Refresh and try again." });
  }
  next();
}
app.use("/api", requireCsrf);
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Please log in." });
  const user = db.prepare("SELECT id,name,email,phone,role,active FROM users WHERE id=?").get(req.session.userId);
  if (!user || !user.active) return res.status(401).json({ error: "Account inactive. Contact the owner." });
  req.user = user;
  next();
}
function allowRoles(...roles) {
  return (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ error: "You do not have permission for this action." });
}
function getCustomerForUser(userId) {
  return db.prepare("SELECT * FROM customers WHERE user_id=?").get(userId);
}

app.get("/api/csrf", (req, res) => res.json({ csrfToken: req.session.csrfToken }));
app.post("/api/auth/login", loginLimiter, (req, res, next) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!user || !user.active || !bcrypt.compareSync(password, user.password_hash)) {
    audit(req, "login_failed");
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  req.session.regenerate(err => {
    if (err) return next(err);
    req.session.userId = user.id;
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    audit({ ...req, user }, "login_success");
    res.json({ user: publicUser(user), csrfToken: req.session.csrfToken });
  });
});
app.post("/api/auth/logout", requireAuth, (req, res) => {
  audit(req, "logout");
  req.session.destroy(() => {
    res.clearCookie("mke.sid", { httpOnly: true, sameSite: "strict", secure: isProd });
    res.json({ ok: true });
  });
});
app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user), csrfToken: req.session.csrfToken }));

// Public website enquiry: stores a real enquiry in the database.
app.post("/api/enquiries", (req, res) => {
  const name = cleanText(req.body.name, 100);
  const phone = normalizePhone(req.body.phone);
  const email = cleanText(req.body.email, 160);
  const product = cleanText(req.body.product, 120);
  const message = cleanText(req.body.message, 2000);
  const consent = req.body.consentWhatsapp === true;
  if (!name || !validPhone(phone) || !message) return res.status(400).json({ error: "Name, valid phone number and message are required." });
  const customerId = ensureCustomer({ name, phone, email, consent });
  const enquiry = db.prepare("INSERT INTO enquiries(customer_id,name,phone,email,product,message) VALUES(?,?,?,?,?,?)")
    .run(customerId, name, phone, email, product, message);
  db.prepare("INSERT INTO messages(customer_id,phone,direction,channel,body,status) VALUES(?,?,'inbound','website',?,'received')")
    .run(customerId, phone, `Enquiry${product ? " about " + product : ""}: ${message}`);
  audit(req, "public_enquiry_created", "enquiry", Number(enquiry.lastInsertRowid));
  res.status(201).json({ ok: true, message: "Your enquiry has been received. The store will contact you." });
});

// Customer self-registration; never accepts a role from the request.
app.post("/api/auth/register", loginLimiter, (req, res) => {
  const name = cleanText(req.body.name, 100);
  const email = cleanText(req.body.email, 160).toLowerCase();
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || "");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validPhone(phone) || password.length < 12) {
    return res.status(400).json({ error: "Enter name, valid email/phone, and a password of at least 12 characters." });
  }
  try {
    const id = createUser({ name, email, phone, password, role: "customer" });
    ensureCustomer({ name, phone, email, userId: id });
    audit(req, "customer_registered", "user", id);
    res.status(201).json({ ok: true, message: "Account created. Please log in." });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "This email is already registered." });
    res.status(500).json({ error: "Could not create account." });
  }
});

app.get("/api/dashboard", requireAuth, allowRoles("owner", "staff"), (req, res) => {
  const counts = {
    customers: db.prepare("SELECT COUNT(*) n FROM customers").get().n,
    newEnquiries: db.prepare("SELECT COUNT(*) n FROM enquiries WHERE status='new'").get().n,
    openOrders: db.prepare("SELECT COUNT(*) n FROM orders WHERE status NOT IN ('delivered','cancelled')").get().n,
    products: db.prepare("SELECT COUNT(*) n FROM products WHERE active=1").get().n,
    messages: db.prepare("SELECT COUNT(*) n FROM messages").get().n,
    views: db.prepare("SELECT COUNT(*) n FROM page_views WHERE created_at >= datetime('now','-30 days')").get().n
  };
  res.json({ counts });
});
app.post("/api/track-view", (req, res) => {
  const page = cleanText(req.body.path || "/", 180);
  const sessionKey = req.session.viewKey || (req.session.viewKey = crypto.randomBytes(16).toString("hex"));
  const already = db.prepare("SELECT id FROM page_views WHERE session_key=? AND path=? AND created_at >= datetime('now','-30 minutes')").get(sessionKey, page);
  if (!already) db.prepare("INSERT INTO page_views(path,session_key) VALUES(?,?)").run(page, sessionKey);
  res.json({ ok: true });
});

// Customers and staff accounts.
app.get("/api/customers", requireAuth, allowRoles("owner", "staff"), (req, res) => {
  const rows = db.prepare(`SELECT c.id,c.name,c.phone,c.email,c.consent_whatsapp,c.notes,c.created_at,
    (SELECT COUNT(*) FROM enquiries e WHERE e.customer_id=c.id) enquiry_count,
    (SELECT COUNT(*) FROM orders o WHERE o.customer_id=c.id) order_count
    FROM customers c ORDER BY c.created_at DESC LIMIT 500`).all();
  res.json({ customers: rows });
});
app.post("/api/customers", requireAuth, allowRoles("owner", "staff"), (req, res) => {
  const name = cleanText(req.body.name, 100), phone = normalizePhone(req.body.phone);
  if (!name || !validPhone(phone)) return res.status(400).json({ error: "Name and valid phone are required." });
  const id = ensureCustomer({ name, phone, email: cleanText(req.body.email,160), consent: req.body.consentWhatsapp === true });
  audit(req, "customer_saved", "customer", id);
  res.status(201).json({ id });
});
app.patch("/api/customers/:id", requireAuth, allowRoles("owner", "staff"), (req, res) => {
  const id = Number(req.params.id);
  const name = cleanText(req.body.name, 100), phone = normalizePhone(req.body.phone);
  if (!name || !validPhone(phone)) return res.status(400).json({ error: "Name and valid phone are required." });
  const result = db.prepare("UPDATE customers SET name=?,phone=?,email=?,notes=?,consent_whatsapp=? WHERE id=?")
    .run(name, phone, cleanText(req.body.email,160), cleanText(req.body.notes,1000), req.body.consentWhatsapp === true ? 1 : 0, id);
  if (!result.changes) return res.status(404).json({ error: "Customer not found." });
  audit(req, "customer_updated", "customer", id);
  res.json({ ok: true });
});
app.get("/api/enquiries", requireAuth, allowRoles("owner", "staff"), (req, res) => {
  res.json({ enquiries: db.prepare("SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 500").all() });
});
app.patch("/api/enquiries/:id", requireAuth, allowRoles("owner", "staff"), (req, res) => {
  const status = cleanText(req.body.status, 30);
  if (!["new","in_progress","replied","closed"].includes(status)) return res.status(400).json({ error: "Invalid status." });
  const result = db.prepare("UPDATE enquiries SET status=? WHERE id=?").run(status, Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Enquiry not found." });
  audit(req, "enquiry_status_updated", "enquiry", Number(req.params.id));
  res.json({ ok: true });
});

// Products.
app.get("/api/products", (req, res) => {
  res.json({ products: db.prepare("SELECT id,name,category,price,description,active FROM products WHERE active=1 ORDER BY name").all() });
});
app.get("/api/admin/products", requireAuth, allowRoles("owner", "staff"), (req, res) => {
  res.json({ products: db.prepare("SELECT * FROM products ORDER BY active DESC,name").all() });
});
app.post("/api/admin/products", requireAuth, allowRoles("owner", "staff"), (req, res) => {
  const name = cleanText(req.body.name, 120);
  if (!name) return res.status(400).json({ error: "Product name is required." });
  const price = req.body.price === "" || req.body.price == null ? null : Number(req.body.price);
  if (price !== null && (!Number.isFinite(price) || price < 0)) return res.status(400).json({ error: "Invalid price." });
  const result = db.prepare("INSERT INTO products(name,category,price,description) VALUES(?,?,?,?)")
    .run(name, cleanText(req.body.category,80), price, cleanText(req.body.description,1000));
  audit(req, "product_created", "product", Number(result.lastInsertRowid));
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});
app.patch("/api/admin/products/:id", requireAuth, allowRoles("owner", "staff"), (req, res) => {
  const id = Number(req.params.id), name = cleanText(req.body.name,120);
  if (!name) return res.status(400).json({ error: "Product name is required." });
  const price = req.body.price === "" || req.body.price == null ? null : Number(req.body.price);
  if (price !== null && (!Number.isFinite(price) || price < 0)) return res.status(400).json({ error: "Invalid price." });
  const result = db.prepare("UPDATE products SET name=?,category=?,price=?,description=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(name, cleanText(req.body.category,80), price, cleanText(req.body.description,1000), req.body.active === false ? 0 : 1, id);
  if (!result.changes) return res.status(404).json({ error: "Product not found." });
  audit(req, "product_updated", "product", id);
  res.json({ ok: true });
});

// Orders and messages.
app.get("/api/orders", requireAuth, allowRoles("owner", "staff"), (req, res) => {
  res.json({ orders: db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500").all() });
});
app.post("/api/orders", requireAuth, allowRoles("owner", "staff"), (req, res) => {
  const customerName = cleanText(req.body.customerName,100), phone = normalizePhone(req.body.customerPhone);
  const total = Number(req.body.total || 0);
  if (!customerName || !validPhone(phone) || !Number.isFinite(total) || total < 0) return res.status(400).json({ error: "Customer name, valid phone and non-negative total are required." });
  const customerId = ensureCustomer({ name: customerName, phone, email: cleanText(req.body.email,160) });
  const items = Array.isArray(req.body.items) ? JSON.stringify(req.body.items.slice(0,30).map(x=>({name:cleanText(x.name,120),quantity:Math.max(1,Math.min(999,Number(x.quantity)||1))}))) : "[]";
  const result = db.prepare("INSERT INTO orders(customer_id,customer_name,customer_phone,items_json,total,notes) VALUES(?,?,?,?,?,?)")
    .run(customerId, customerName, phone, items, total, cleanText(req.body.notes,1000));
  audit(req, "order_created", "order", Number(result.lastInsertRowid));
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});
app.patch("/api/orders/:id", requireAuth, allowRoles("owner", "staff"), (req, res) => {
  const status = cleanText(req.body.status,30), payment = cleanText(req.body.paymentStatus,30);
  if (!["new","confirmed","processing","ready","delivered","cancelled"].includes(status) || !["pending","paid","refunded"].includes(payment)) return res.status(400).json({ error: "Invalid order/payment status." });
  const result = db.prepare("UPDATE orders SET status=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status,payment,Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Order not found." });
  audit(req, "order_updated", "order", Number(req.params.id));
  res.json({ ok: true });
});
app.get("/api/messages", requireAuth, allowRoles("owner", "staff"), (req, res) => {
  res.json({ messages: db.prepare("SELECT m.*,u.name created_by_name FROM messages m LEFT JOIN users u ON u.id=m.created_by ORDER BY m.created_at DESC LIMIT 500").all() });
});
app.post("/api/messages/send", requireAuth, allowRoles("owner", "staff"), async (req, res) => {
  const phone = normalizePhone(req.body.phone), body = cleanText(req.body.body, 1000);
  const channel = req.body.channel === "whatsapp" ? "whatsapp" : "website";
  if (!validPhone(phone) || !body) return res.status(400).json({ error: "Valid phone and message are required." });
  const customer = db.prepare("SELECT * FROM customers WHERE phone=?").get(phone);
  if (channel === "whatsapp") {
    if (!customer || !customer.consent_whatsapp) return res.status(400).json({ error: "Record the customer's WhatsApp consent before sending." });
    if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) return res.status(503).json({ error: "WhatsApp Cloud API is not configured yet. Add the Meta credentials to .env." });
    try {
      const version = process.env.WHATSAPP_API_VERSION || "v23.0";
      const apiRes = await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: phone.replace(/^\+/, ""), type: "text", text: { preview_url: false, body } })
      });
      const data = await apiRes.json();
      if (!apiRes.ok) return res.status(502).json({ error: "Meta WhatsApp API rejected the message.", detail: data.error?.message || "Unknown provider error." });
      const providerId = data.messages?.[0]?.id || "";
      db.prepare("INSERT INTO messages(customer_id,phone,direction,channel,body,provider_message_id,status,created_by) VALUES(?,?,'outbound','whatsapp',?,?,?,?)")
        .run(customer?.id || null, phone, body, providerId, "sent_to_provider", req.user.id);
      audit(req, "whatsapp_message_sent", "message", null);
      return res.json({ ok: true, providerMessageId: providerId, note: "Accepted by Meta; delivery status arrives through webhook." });
    } catch (e) {
      return res.status(502).json({ error: "WhatsApp API request failed. Check server logs and Meta configuration." });
    }
  }
  db.prepare("INSERT INTO messages(customer_id,phone,direction,channel,body,status,created_by) VALUES(?,?,'outbound','website',?,'logged',?)")
    .run(customer?.id || null, phone, body, req.user.id);
  audit(req, "website_message_logged", "message", null);
  res.json({ ok: true, note: "Saved in the message history. Website messages are not delivered as SMS/WhatsApp unless an integration is used." });
});

// Customer portal: customers only see their own profile, orders and messages.
app.get("/api/customer/summary", requireAuth, allowRoles("customer"), (req, res) => {
  const customer = getCustomerForUser(req.user.id);
  if (!customer) return res.json({ customer: null, orders: [], messages: [], enquiries: [] });
  res.json({
    customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email },
    orders: db.prepare("SELECT id,items_json,total,status,payment_status,created_at FROM orders WHERE customer_id=? ORDER BY created_at DESC").all(customer.id),
    messages: db.prepare("SELECT id,direction,channel,body,status,created_at FROM messages WHERE customer_id=? ORDER BY created_at DESC LIMIT 100").all(customer.id),
    enquiries: db.prepare("SELECT id,product,message,status,created_at FROM enquiries WHERE customer_id=? ORDER BY created_at DESC").all(customer.id)
  });
});

// Owner-only staff management and CSV reports.
app.get("/api/staff", requireAuth, allowRoles("owner"), (req, res) => {
  res.json({ staff: db.prepare("SELECT id,name,email,phone,active,created_at FROM users WHERE role='staff' ORDER BY created_at DESC").all() });
});
app.post("/api/staff", requireAuth, allowRoles("owner"), (req, res) => {
  const name=cleanText(req.body.name,100), email=cleanText(req.body.email,160).toLowerCase(), phone=normalizePhone(req.body.phone), password=String(req.body.password||"");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<12) return res.status(400).json({error:"Name, valid email and a password of at least 12 characters are required."});
  try { const id=createUser({name,email,phone,password,role:"staff"}); audit(req,"staff_created","user",id); res.status(201).json({id}); }
  catch(e) { if(String(e.message).includes("UNIQUE")) return res.status(409).json({error:"Email already exists."}); res.status(500).json({error:"Could not create staff account."}); }
});
app.patch("/api/staff/:id", requireAuth, allowRoles("owner"), (req, res) => {
  const active=req.body.active===true?1:0;
  const result=db.prepare("UPDATE users SET active=? WHERE id=? AND role='staff'").run(active,Number(req.params.id));
  if(!result.changes) return res.status(404).json({error:"Staff account not found."});
  audit(req,"staff_active_changed","user",Number(req.params.id)); res.json({ok:true});
});
app.get("/api/reports/summary", requireAuth, allowRoles("owner", "staff"), (req, res) => {
  const daily = db.prepare(`SELECT date(created_at) day,COUNT(*) enquiries FROM enquiries WHERE created_at>=datetime('now','-30 days') GROUP BY date(created_at) ORDER BY day`).all();
  const orderStatuses = db.prepare("SELECT status,COUNT(*) count FROM orders GROUP BY status").all();
  const sales = db.prepare("SELECT COALESCE(SUM(total),0) total FROM orders WHERE payment_status='paid' AND status!='cancelled'").get().total;
  res.json({ daily, orderStatuses, paidSales: sales });
});
app.get("/api/reports/customers.csv", requireAuth, allowRoles("owner"), (req, res) => {
  const rows = db.prepare("SELECT id,name,phone,email,consent_whatsapp,created_at FROM customers ORDER BY created_at DESC").all();
  const quote = v => `"${String(v ?? "").replace(/"/g,'""')}"`;
  const csv = ["id,name,phone,email,whatsapp_consent,created_at", ...rows.map(r=>[r.id,r.name,r.phone,r.email,r.consent_whatsapp,r.created_at].map(quote).join(","))].join("\r\n");
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition",'attachment; filename="maa-kalawati-customers.csv"');
  res.send("\uFEFF"+csv);
});

// Meta webhook verification and inbound WhatsApp message logging.
app.get("/webhooks/whatsapp", (req, res) => {
  const mode=req.query["hub.mode"], token=req.query["hub.verify_token"], challenge=req.query["hub.challenge"];
  if (mode==="subscribe" && token && token===process.env.WHATSAPP_VERIFY_TOKEN) return res.status(200).send(String(challenge || ""));
  res.sendStatus(403);
});
app.post("/webhooks/whatsapp", (req, res) => {
  // Meta signs webhook payloads with the app secret. Fail closed in production.
  const signature = req.get("x-hub-signature-256") || "";
  if (!WHATSAPP_APP_SECRET) {
    if (isProd) return res.status(503).send("WhatsApp webhook signature verification is not configured.");
    console.warn("WhatsApp webhook received without WHATSAPP_APP_SECRET; development-only acceptance.");
  } else {
    const expected = "sha256=" + crypto.createHmac("sha256", WHATSAPP_APP_SECRET).update(req.rawBody || Buffer.alloc(0)).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.sendStatus(401);
  }
  try {
    const entries = req.body.entry || [];
    for (const entry of entries) for (const change of (entry.changes || [])) {
      const value = change.value || {};
      for (const msg of (value.messages || [])) {
        const phone=normalizePhone(msg.from);
        const body=msg.text?.body || `[${msg.type || "non-text"} WhatsApp message]`;
        const profile=value.contacts?.find(c=>c.wa_id===msg.from)?.profile?.name || "WhatsApp Customer";
        const customerId=ensureCustomer({name:profile,phone});
        db.prepare("INSERT INTO messages(customer_id,phone,direction,channel,body,provider_message_id,status) VALUES(?,?,'inbound','whatsapp',?,?,?)")
          .run(customerId,phone,cleanText(body,2000),msg.id||"","received");
      }
      for (const status of (value.statuses || [])) {
        db.prepare("UPDATE messages SET status=? WHERE provider_message_id=?").run(cleanText(status.status,30),cleanText(status.id,180));
      }
    }
    res.sendStatus(200);
  } catch (e) { console.error("WhatsApp webhook error",e); res.sendStatus(200); }
});

app.get("/health", (req,res)=>res.json({ok:true,service:"maa-kalawati-enterprises"}));
app.use(express.static(path.join(__dirname,"public"), { extensions:["html"], maxAge:isProd?"1h":0 }));
app.get("/admin", (req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.get("/customer", (req,res)=>res.sendFile(path.join(__dirname,"public","customer.html")));
app.use((err,req,res,next)=>{ console.error(err); res.status(500).json({error:"Unexpected server error."}); });
app.listen(PORT,()=>console.log(`Maa Kalawati Enterprises app running at ${process.env.BASE_URL || `http://localhost:${PORT}`}`));
