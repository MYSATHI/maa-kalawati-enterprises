# Maa Kalawati Enterprises — मुफ्त Hosting शुरू करने की हिन्दी गाइड

## पहले सही बात जान लें
- वेबसाइट को मुफ्त में सार्वजनिक URL पर प्रकाशित करने के लिए Render Free का इस्तेमाल करके शुरुआत/डेमो किया जा सकता है। Render Free सेवा 15 मिनट बिना ट्रैफिक के बाद sleep हो सकती है; पहली बार खुलने में लगभग एक मिनट लग सकता है।
- इस प्रोजेक्ट में SQLite database और session data लोकल फाइल में सेव होते हैं। Render Free का filesystem स्थायी नहीं है; restart/redeploy/sleep पर database और customer records खो सकते हैं। इसलिए **असली ग्राहक डेटा, orders या स्थायी Admin Panel के लिए इस Free setup को भरोसेमंद production समाधान न मानें**। Render persistent disk paid plan मांगती है।
- GitHub Pages मुफ्त है, लेकिन वह केवल static HTML/CSS/JS वेबसाइट host करता है; Node.js server, सुरक्षित owner login और database नहीं चलाता।
- ऊपर चलने वाली दुकान की जानकारी (`index.html` ticker) अब वेबसाइट के design में शामिल है। यह पता, फोन, समय और उत्पाद श्रेणियां लगातार दिखाता है। यह अभी HTML में लिखी जानकारी है; Admin Panel से बदलने वाला dynamic ticker अलग backend feature होगा।

## A. मुफ्त public preview (Render)
1. `https://github.com` पर account बनाएं और नई **Private** repository `maa-kalawati-enterprises` बनाएं।
2. इस project folder की files repository में upload करें। `node_modules`, `.env`, `data/` और SQLite database upload न करें। `public/videos/enterprise.mp4` लगभग 120 MB है; GitHub web upload सीमा/फाइल सीमा की वजह से इसे Git LFS या external video hosting पर रखना पड़ सकता है। बड़ी वीडियो फ़ाइल के बिना पहले deploy करना आसान है।
3. `https://render.com` पर sign up करके GitHub connect करें।
4. Dashboard में **New + → Web Service** चुनें और repository connect करें।
5. Settings में:
   - Runtime: Node
   - Build command: `npm install && npm run check`
   - Start command: `npm start`
   - Plan: Free (अगर आपके account में उपलब्ध हो)
6. Environment variables जोड़ें:
   - `NODE_ENV` = `production`
   - `NODE_VERSION` = `22.16.0`
   - `SESSION_SECRET` = कम-से-कम 32 अक्षरों की कोई मजबूत random secret
   - `OWNER_NAME` = `Maa Kalawati Enterprises Owner`
   - `OWNER_EMAIL` = आपका अपना ईमेल
   - `OWNER_PASSWORD` = अलग, मजबूत password (कम-से-कम 16 characters)
   - `DATABASE_FILE` = `/tmp/maa-kalawati.sqlite` (केवल preview/test; data persistent नहीं है)
7. Deploy पूरा होने पर Render का `https://....onrender.com` URL खुलेगा। Admin: उसी URL के बाद `/admin.html`। Customer portal: `/customer.html`।
8. मोबाइल पर वही URL खोलें। Admin password किसी से साझा न करें।

## B. Free preview से पहले video upload को हल्का करना
यदि GitHub पर 120 MB वीडियो upload नहीं हो रहा, तो `public/videos/enterprise.mp4` को repo से हटाकर video को किसी उपयुक्त video host पर डालना और `index.html` के video `src` को उस video के embed/URL से बदलना होगा। फ़ाइल हटाने से पहले अपने कंप्यूटर पर backup रखें।

## C. Live करने के बाद जाँचें
- Homepage खुलता है और ऊपर shop ticker लगातार चलता है।
- `/health` पर health response आता है।
- `/admin.html` खुलता है और owner login होता है।
- Test enquiry submit होती है।
- Free host पर data खो सकता है—कोई असली ग्राहक डेटा न डालें, जब तक persistent database/storage की व्यवस्था न हो।

## स्थायी Admin Panel के लिए अगला चरण
इस codebase का current database SQLite है। विश्वसनीय online use के लिए database को managed PostgreSQL/अन्य persistent database में migrate करना, uploaded photos/videos के लिए persistent object storage जोड़ना, और offers/media manager पूरा करना होगा। केवल hosting setting बदलने से यह काम नहीं होता। Render का वर्तमान free plan persistent disk नहीं देता; persistent disk के लिए paid plan है।
