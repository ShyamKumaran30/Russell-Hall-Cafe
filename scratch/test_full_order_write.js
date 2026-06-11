const https = require('https');

const apiKey = "AIzaSyA5Oj6hCzedhggjLJf5u6JqTS8zPO3J5sg";
const email = `test_cust_full_${Math.floor(Math.random() * 10000)}@test.com`;
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
  const userProfile = {
    fields: {
      uid: { stringValue: uid },
      email: { stringValue: email },
      name: { stringValue: "Test Customer Full" },
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

  console.log("\nStep 3: Attempting to create a full cash order document in Firestore...");
  const orderId = `test_full_${Math.floor(Math.random() * 10000)}`;
  
  // Construct the full order document matching user portal cash checkout format
  const orderDoc = {
    fields: {
      orderId: { stringValue: orderId },
      userId: { stringValue: uid },
      customerDetails: {
        mapValue: {
          fields: {
            name: { stringValue: "Test Customer Full" },
            email: { stringValue: email },
            phone: { stringValue: "07123456789" }
          }
        }
      },
      items: {
        arrayValue: {
          values: [
            {
              mapValue: {
                fields: {
                  id: { stringValue: "m1" },
                  name: { stringValue: "Traditional Full English" },
                  qty: { integerValue: "1" },
                  price: { doubleValue: 8.95 },
                  options: { arrayValue: {} }
                }
              }
            }
          ]
        }
      },
      subtotal: { doubleValue: 8.95 },
      tip: { doubleValue: 0 },
      vat: { doubleValue: 1.49 },
      prepTime: { integerValue: "15" },
      total: { doubleValue: 8.95 },
      orderType: { stringValue: "collection" },
      tableNumber: { stringValue: "" },
      instructions: { stringValue: "" },
      status: { stringValue: "received" },
      paymentMethod: { stringValue: "cash" },
      paymentStatus: { stringValue: "cash-pending" },
      estimatedTime: { stringValue: "15 mins" },
      createdAt: { stringValue: new Date().toISOString() }
    }
  };

  const orderData = JSON.stringify(orderDoc);
  const orderOptions = {
    hostname: 'firestore.googleapis.com',
    path: `/v1/projects/russell-hall-cafe/databases/(default)/documents/orders/${orderId}`,
    method: 'PATCH', // REST API creates or replaces using PATCH on document path without query params
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
      'Content-Length': Buffer.byteLength(orderData)
    }
  };

  let orderRes = await makeRequest(orderOptions, orderData);
  console.log(`Order Create Status Code: ${orderRes.statusCode}`);
  console.log(`Order Create Response: ${orderRes.body}`);
}

runTest().catch(console.error);
