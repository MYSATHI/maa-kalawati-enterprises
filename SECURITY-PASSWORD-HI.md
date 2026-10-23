# Maa Kalawati Enterprises — Admin Password & Security (Hindi)

## पहले समझें
- Public website customers के लिए खुली रहती है। Admin/Staff panel और उसके private APIs login से सुरक्षित हैं।
- Admin URL: `/admin.html` या `/admin`.
- Password को HTML/JavaScript में न लिखें और GitHub पर कभी upload न करें। Owner password server के Environment Variables में रखें।

## Local computer पर पहली बार Owner password सेट करें
1. Project folder खोलें।
2. `.env.example` की copy बनाकर उसका नाम `.env` रखें।
3. `.env` में ये values अपने अनुसार बदलें:
   - `NODE_ENV=development` (local test के लिए)
   - `SESSION_SECRET=` के आगे कम-से-कम 32 characters का random secret रखें।
   - `OWNER_NAME=आपका नाम`
   - `OWNER_EMAIL=आपका अपना email`
   - `OWNER_PASSWORD=` के आगे 16+ characters का unique password रखें।
4. Password में spaces हों तो उसे quotes में रखें; आसान/पुराना password न इस्तेमाल करें।
5. Terminal में `npm install`, फिर `npm run check`, फिर `npm start` चलाएँ।
6. `http://localhost:3000/admin.html` खोलें और OWNER_EMAIL तथा OWNER_PASSWORD से login करें।

## Online hosting पर
1. Hosting provider के Environment/Secrets section में `NODE_ENV=production`, `SESSION_SECRET`, `OWNER_NAME`, `OWNER_EMAIL`, `OWNER_PASSWORD`, और `DATABASE_FILE` सेट करें।
2. `SESSION_SECRET` के लिए अपने computer के terminal में `openssl rand -hex 32` चला सकते हैं; जो value मिले उसे केवल hosting के secret field में डालें।
3. `OWNER_PASSWORD` के लिए एक अलग, unique, 16+ character password बनाएं। उसे chat, code, screenshot या public repository में न डालें।
4. `.env` file को GitHub पर upload न करें। `.gitignore` में `.env` पहले से ignored है; GitHub पर upload करने से पहले repository में secrets जाँचें।
5. HTTPS enabled URL पर `/admin.html` खोलें और login जाँचें। किसी public computer पर login न करें; काम के बाद Logout करें।

## जरूरी सुरक्षा
- Server में password bcrypt hash के रूप में database में store होता है; login attempts पर rate limit, secure session cookie, CSRF protection और role checks मौजूद हैं।
- गलत password कई बार डालने पर login rate limit लगती है।
- अपना Owner password किसी को न दें। हर staff member के लिए अलग staff account बनाएँ।
- Password भूल जाएँ तो database या hosting secrets की recovery/controlled reset प्रक्रिया चाहिए; कोई master/default password नहीं है।
- Free hosting की ephemeral disk पर database स्थायी न भी रहे। Live customer data लेने से पहले persistent database/backup की व्यवस्था करें।
- कोई भी website 100% hack-proof नहीं होती; dependencies update करें और database backups रखें।

## यह public website पर password लगाने से अलग है
अगर आप चाहते हैं कि कोई भी ग्राहक main website भी password डाले बिना न देख सके, तो वह अलग व्यवस्था है। आमतौर पर business website public रहती है और सिर्फ `/admin` login-protected होता है।
