# Maa Kalawati Enterprises — इंटरनेट पर Hosting करने की हिन्दी गाइड

यह सेटअप Render Web Service + Persistent Disk के लिए तैयार किया गया है। इससे वेबसाइट और Admin Panel कंप्यूटर तथा मोबाइल, दोनों पर इंटरनेट से खुलेंगे। **यह फ़ाइलें hosting को अपने-आप चालू नहीं करतीं**—आपको अपने Render और GitHub खातों में नीचे दिए चरण पूरे करने होंगे। Render पर persistent disk के लिए paid web-service plan चाहिए; deploy करने से पहले Render के वर्तमान शुल्क जाँचें।

## पहले से तैयार
- `render.yaml`: Node web service, health check, persistent disk और environment variables की configuration.
- `server.js`: production में SQLite-backed session store और proxy-aware secure cookies.
- `DATABASE_FILE=/var/data/maa-kalawati.sqlite`: database persistent disk में रहेगा.
- `.gitignore`: `.env`, passwords और local database को GitHub पर भेजने से रोकता है.

## चरण 1 — फ़ाइलें कंप्यूटर पर रखें
1. ZIP को Extract करें.
2. Extract हुए `maa_kalawati_enterprises_full_business_panel` फ़ोल्डर के अंदर `package.json`, `server.js`, `public` और `render.yaml` मौजूद होने चाहिए.
3. `README-SETUP-HI.md` के अनुसार कंप्यूटर पर स्थानीय test करना चाहें तो Node.js 20+ लगाकर `npm install`, `npm run check`, फिर `npm start` चलाएँ. Local admin: `http://localhost:3000/admin.html`.

## चरण 2 — GitHub पर निजी repository बनाएँ
1. GitHub.com पर account बनाएँ/लॉगिन करें.
2. **New repository** दबाएँ, नाम `maa-kalawati-enterprises` रखें. शुरुआत में Private चुनना बेहतर है.
3. Project folder की फ़ाइलें repository में upload/push करें. फ़ोल्डर के अंदर की फ़ाइलें upload हों—पूरे parent folder के भीतर एक और अनावश्यक nested folder न बन जाए.
4. `node_modules`, `.env` या कोई database file upload न करें. `.gitignore` इन्हें रोकने में मदद करता है.

## चरण 3 — Render से deploy करें
1. Render.com पर account बनाएँ और GitHub connect करें.
2. Dashboard में **New + → Blueprint** चुनें और अपनी `maa-kalawati-enterprises` repository connect करें.
3. Render को repository की `render.yaml` file पढ़ने दें. Service बनाने से पहले दिखने वाला plan/price जाँचें; configuration `starter` paid plan और 1 GB persistent disk मांगती है.
4. जब Render पूछे, `OWNER_EMAIL` में अपना ईमेल और `OWNER_PASSWORD` में लंबा, unique password भरें. कम-से-कम 16 characters का password रखें; इसे किसी को न भेजें. Render `SESSION_SECRET` अपने-आप generate करेगा.
5. Blueprint apply/create करें और build/deploy पूरा होने का इंतज़ार करें. `better-sqlite3` native dependency के कारण build logs में error आए तो logs को देखें; error रहते हुए site live न मानें.
6. Service के **Events/Logs** में successful deploy और `/health` health check देखें.

## चरण 4 — वेबसाइट और Admin Panel खोलें
Render आपको `https://<service-name>.onrender.com` जैसा URL देगा. इसी URL को मोबाइल और कंप्यूटर दोनों में खोलें.
- Website: service URL
- Admin: `https://<service-name>.onrender.com/admin.html`
- Customer portal: `https://<service-name>.onrender.com/customer.html`
- Health check: `https://<service-name>.onrender.com/health`

पहले Admin में अपने `OWNER_EMAIL` और `OWNER_PASSWORD` से login करके test करें. Login के बाद password साझा न करें. यदि owner account पहले ही database में मौजूद है तो environment में password बदलने से मौजूदा account का password अपने-आप update नहीं होगा; ऐसी स्थिति में पहले मौजूदा credentials इस्तेमाल करें या सुरक्षित password-reset प्रक्रिया बनवाएँ.

## चरण 5 — अनिवार्य परीक्षण
- [ ] मोबाइल और कंप्यूटर दोनों पर homepage और `/admin.html` खुलें.
- [ ] Owner login/logout सफल हो.
- [ ] Test enquiry भेजकर Admin में दिखाई दे.
- [ ] Test product जोड़ें/disable करें और homepage पर बदलाव देखें.
- [ ] Reports, orders, messages और customer permissions test करें.
- [ ] Redeploy/restart के बाद test record और login session data सुरक्षित रहें.
- [ ] Render disk mount `/var/data` और database path सही हों.
- [ ] Customer का वास्तविक निजी data डालने से पहले privacy notice, backups और restore test पूरे करें.

## सुरक्षा और सीमाएँ
- `OWNER_PASSWORD`, Meta tokens या अन्य secrets को HTML/JavaScript या GitHub repository में न डालें; केवल Render Environment settings में रखें.
- इस project में SQLite-backed session store जोड़ा गया है; persistent disk के बिना database/session/uploads की स्थायी सुरक्षा की गारंटी नहीं होगी. Disk पर SQLite के साथ एक service instance रखें.
- वर्तमान starter में customer messages/orders/products/reporting के कई backend features हैं, लेकिन यह हर चुनी हुई सुविधा का पूर्ण CMS नहीं है: अलग Offers/Notices manager और photo/video upload manager उपलब्ध होने का दावा न करें जब तक वे अलग से implement न हों.
- WhatsApp Business API तभी चलेगी जब Meta की official credentials, verified number और webhook configuration पूरी हो. खाली credentials के साथ WhatsApp को live न मानें.
- सार्वजनिक deployment से पहले access control, backup/restore, privacy/retention और mobile testing को पूरा करें. वेबसाइट पर real customer data डालने से पहले कम-से-कम एक restore test करें.

## यदि कहीं अटकें
Render की build/deploy log में लाल error की पूरी text copy करें (लेकिन passwords/tokens नहीं) और सहायता के लिए भेजें. अपनी password या API token कभी साझा न करें.
