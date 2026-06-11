const https = require('https');

const apiKey = "AIzaSyA5Oj6hCzedhggjLJf5u6JqTS8zPO3J5sg";
const email = `test_cust_${Math.floor(Math.random() * 10000)}@test.com`;
const password = "TestPassword123!";

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });
    req.on('error', (e) => reject(e));
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTest() {
  console.log(`Step 1: Registering user ${email}...`);
  const signUpData = JSON.stringify({ email, password, returnSecureToken: true });
  const signUpOptions = {
    hostname: 'identitytoolkit.googleapis.com',
    path: `/v1/accounts:signUp?key=${apiKey}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(signUpData)
    }
  };

  let signUpRes = await makeRequest(signUpOptions, signUpData);
  let signUpBody = JSON.parse(signUpRes.body);
  if (!signUpBody.localId) {
    console.error("Sign up failed:", signUpBody);
    return;
  }
  const uid = signUpBody.localId;
  const idToken = signUpBody.idToken;
  console.log(`✓ User registered with UID: ${uid}`);

  console.log("\nStep 2: Creating user profile document in Firestore...");
  // Rules check: allow write: if isAuth() && (request.auth.uid == userId || isAdmin())
  const userProfile = {
    fields: {
      uid: { stringValue: uid },
      email: { stringValue: email },
      name: { stringValue: "Test Customer" },
      role: { stringValue: "customer" }
    }
  };
  const profileData = JSON.stringify(userProfile);
  const profileOptions = {
    hostname: 'firestore.googleapis.com',
    path: `/v1/projects/russell-hall-cafe/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=uid&updateMask.fieldPaths=email&updateMask.fieldPaths=name&updateMask.fieldPaths=role`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
      'Content-Length': Buffer.byteLength(profileData)
    }
  };

  let profileRes = await makeRequest(profileOptions, profileData);
  console.log(`Profile Write Status Code: ${profileRes.statusCode}`);
  console.log(`Profile Write Response: ${profileRes.body}`);

  console.log("\nStep 3: Attempting to create an order document in Firestore...");
  const orderId = `test_order_${Math.floor(Math.random() * 10000)}`;
  const orderDoc = {
    fields: {
      orderId: { stringValue: orderId },
      userId: { stringValue: uid },
      status: { stringValue: "pending" },
      createdAt: { stringValue: new Date().toISOString() }
    }
  };
  const orderData = JSON.stringify(orderDoc);
  const orderOptions = {
    hostname: 'firestore.googleapis.com',
    path: `/v1/projects/russell-hall-cafe/databases/(default)/documents/orders/${orderId}?updateMask.fieldPaths=orderId&updateMask.fieldPaths=userId&updateMask.fieldPaths=status&updateMask.fieldPaths=createdAt`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
      'Content-Length': Buffer.byteLength(orderData)
    }
  };

  let orderRes = await makeRequest(orderOptions, orderData);
  console.log(`Order Create Status Code: ${orderRes.statusCode}`);
  console.log(`Order Create Response: ${orderRes.body}`);

  console.log("\nStep 4: Attempting to query orders as the customer...");
  // Query orders where userId == uid
  const queryBody = JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'userId' },
          op: 'EQUAL',
          value: { stringValue: uid }
        }
      }
    }
  });
  const queryOptions = {
    hostname: 'firestore.googleapis.com',
    path: `/v1/projects/russell-hall-cafe/databases/(default)/documents:runQuery`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
      'Content-Length': Buffer.byteLength(queryBody)
    }
  };

  let queryRes = await makeRequest(queryOptions, queryBody);
  console.log(`Order Query Status Code: ${queryRes.statusCode}`);
  console.log(`Order Query Response: ${queryRes.body}`);
}

runTest().catch(console.error);
