const https = require('https');

const apiKey = "AIzaSyA5Oj6hCzedhggjLJf5u6JqTS8zPO3J5sg";
const email = "admin@russellhallcafe.co.uk";
const password = "RHAdmin2026!";

const authData = JSON.stringify({
  email: email,
  password: password,
  returnSecureToken: true
});

const authOptions = {
  hostname: 'identitytoolkit.googleapis.com',
  path: `/v1/accounts:signInWithPassword?key=${apiKey}`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(authData)
  }
};

const req = https.request(authOptions, (res) => {
  let body = '';
  res.on('data', (d) => { body += d; });
  res.on('end', () => {
    try {
      const response = JSON.parse(body);
      if (response.idToken) {
        checkOrders(response.idToken);
      } else {
        console.error("Auth failed:", response);
      }
    } catch (e) {
      console.error("Parse error:", e.message);
    }
  });
});

req.write(authData);
req.end();

function checkOrders(idToken) {
  const url = 'https://firestore.googleapis.com/v1/projects/russell-hall-cafe/databases/(default)/documents/orders?pageSize=100';
  https.get(url, { headers: { 'Authorization': `Bearer ${idToken}` } }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.documents) {
          console.log(`Firestore Orders Count: ${data.documents.length}`);
          data.documents.forEach((doc, idx) => {
            const fields = doc.fields || {};
            const orderId = fields.orderId ? fields.orderId.stringValue : 'N/A';
            const userId = fields.userId ? fields.userId.stringValue : 'N/A';
            const status = fields.status ? fields.status.stringValue : 'N/A';
            const createdAt = fields.createdAt ? JSON.stringify(fields.createdAt) : 'N/A';
            console.log(`[${idx}] Doc: ${doc.name.split('/').pop()} | orderId: ${orderId} | userId: ${userId} | status: ${status} | createdAt: ${createdAt}`);
          });
        } else {
          console.log('No orders found in Firestore.', data);
        }
      } catch (e) {
        console.error("Error parsing response:", e.message);
      }
    });
  });
}
