# Maa Kalawati Enterprises — Full Business Panel

यह प्रोजेक्ट आपकी मौजूदा वेबसाइट के साथ backend, SQLite database और अलग Admin/Customer portals जोड़ता है। यह अभी आपके public domain पर live नहीं है; पहले local test और फिर hosting/deployment आवश्यक है।

## क्या वास्तविक रूप से शामिल है
- Owner, staff और customer के लिए server-side role-based login.
- SQLite database: customers, website enquiries, message log, orders, products, page views और audit logs.
- Website enquiry form के लिए backend endpoint `/api/enquiries`.
- Owner/staff dashboard, customer list, enquiry status, message history, orders, products (add/activate/deactivate) और basic reports. Public homepage पर active database products उपलब्ध होने पर दिखते हैं; खाली database पर sample categories दिखती हैं.
- Owner-only staff account management और customer CSV export.
- Customer portal `/customer` केवल लॉग-इन ग्राहक के अपने orders/enquiries/messages दिखाता है.
- Official WhatsApp Cloud API outbound endpoint और webhook receiver. Meta credentials के बिना WhatsApp sending चालू नहीं होगी.
- Customer WhatsApp opt-in field; outbound WhatsApp भेजने से पहले consent आवश्यक.

## स्थानीय कंप्यूटर पर चलाने के लिए
1. Node.js 20 या नया LTS install करें.
2. इस फ़ोल्डर में terminal खोलें.
3. `.env.example` की कॉपी बनाकर `.env` नाम दें.
4. `.env` में `SESSION_SECRET`, `OWNER_EMAIL`, `OWNER_PASSWORD` बदलें. Owner password कम से कम 12 characters का मजबूत, unique password रखें.
5. Commands चलाएँ:
   ```bash
   npm install
   npm run check
   npm start
   ```
6. Chrome में `http://localhost:3000` खोलें.
7. Admin login: `http://localhost:3000/admin.html`
8. Customer portal: `http://localhost:3000/customer.html`

पहली बार server शुरू होने पर, यदि `OWNER_EMAIL` और `OWNER_PASSWORD` सेट हैं और owner मौजूद नहीं है, owner account बन जाता है. इन credentials को किसी के साथ साझा न करें.

## आपकी वेबसाइट के enquiry form को backend से जोड़ना
इस package में मौजूदा homepage अभी भी included है. सार्वजनिक form को वास्तविक database में भेजने के लिए `public/index.html` के पुराने demo `contactForm` submit handler को नीचे दिए logic से बदलें:
```js
document.getElementById('contactForm').addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    name: document.getElementById('name').value,
    phone: document.getElementById('phone').value,
    message: document.getElementById('message').value,
    product: ''
  };
  const r = await fetch('/api/enquiries', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  const d = await r.json();
  if (!r.ok) { alert(d.error || 'Enquiry could not be sent.'); return; }
  alert(d.message);
  e.target.reset();
});
```
यह बदलाव इस build में पहले से लागू किया गया है.

## Official WhatsApp Business setup
1. Meta for Developers में Meta Business app बनाकर WhatsApp product जोड़ें.
2. Business के अपने WhatsApp Business Platform phone number को configure/verify करें.
3. `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` और API version `.env` में रखें. `WHATSAPP_APP_SECRET` webhook POST signature verify करने के लिए आवश्यक है. Token को browser HTML/JS में कभी न रखें.
4. HTTPS domain deploy करें और webhook URL सेट करें: `https://YOUR-DOMAIN/webhooks/whatsapp`.
5. Meta webhook में `messages` events subscribe करें और verification token `.env` से match करें.
6. पहले test number से inbound/outbound test करें. Production के लिए stable/permanent token और Meta business verification की जरूरत हो सकती है.
7. Promotional messages के लिए clear opt-in लें. WhatsApp के 24-hour customer-service window के बाहर business-initiated messages के लिए approved message templates की जरूरत हो सकती है. इस starter का send endpoint plain text है; production template messaging को अलग से implement/test करें.

## Production deployment से पहले जरूरी काम
- HTTPS अनिवार्य करें और `NODE_ENV=production` रखें. इस पैकेज में Render के लिए `render.yaml` और `README-HOSTING-HI.md` deployment guide शामिल हैं.
- Render configuration `SESSION_SECRET` generate करती है और SQLite-backed session store का उपयोग करती है.
- SQLite file को persistent disk पर रखें; backup/restore test और access restrictions जरूरी हैं. कई servers पर PostgreSQL बेहतर रहेगा.
- Reverse proxy की trust settings सही configure करें; rate limits, monitoring, backup restore और incident response test करें.
- `WHATSAPP_APP_SECRET` set करके WhatsApp webhook POST signature (`X-Hub-Signature-256`) verification सक्षम करें. Production mode में secret missing होने पर webhook POST reject होगा.
- Customer deletion/export, consent withdrawal, retention policy और privacy notice लागू करें.
- Login, recovery, password changes, staff permissions, and CSRF/session rotation को production security review से गुजारें.
- Owner account का password first login के बाद बदलने और MFA जोड़ने की सलाह है.

## Demo बनाम वास्तविक सुविधा
- **वास्तविक server-side सुविधा (server चलाने और deployment के बाद):** owner/staff/customer login, database में enquiries/customers/orders/products/messages, reports, role permissions और customer portal. केवल browser में HTML file खोलने से backend नहीं चलेगा.
- **अभी सक्रिय नहीं:** WhatsApp Cloud API तब तक नहीं चलेगी जब तक आपके Meta Business credentials, verified WhatsApp Business Platform number, webhook URL और consent workflow configure/test न हों.
- **अभी production-ready नहीं:** durable session store, automated backups/restore test, privacy/retention workflow और external security review deployment से पहले पूरे करें.

## ईमानदार स्थिति
यह deployable starter project है, लेकिन अभी किसी public server पर live नहीं है. WhatsApp credentials नहीं दिए गए हैं, इसलिए official WhatsApp messaging इस समय configured/active नहीं है. Website page views approximate counts हैं; वे unique real people की पक्की गिनती नहीं हैं. Admin panel customer records तभी दिखाएगा जब data website form, staff entry, customer registration या configured WhatsApp webhook से आएगा. यह किसी के private WhatsApp/SMS या दूसरे app chats को पढ़ नहीं सकता.
