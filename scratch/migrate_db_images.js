const https = require('https');

const apiKey = "AIzaSyA5Oj6hCzedhggjLJf5u6JqTS8zPO3J5sg";
const email = "admin@russellhallcafe.co.uk";
const password = "RHAdmin2026!";

// Mapping table for specific images
const customMappings = {
  'breakfast-muffin-full.png': 'breakfast-muffin.jpg',
  'soup.png': 'soup-of-the-day.jpg',
  'ham-cheese-sw.png': 'ham-cheese.jpg',
  'earl-grey-tea.png': 'earl-grey-herbal-tea.jpg',
  // Note: cheese-tomato.png -> cheese-tomato.jpg (directly converted)
  // Note: mocha.png -> mocha.jpg (directly converted)
};

function postJson(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const bodyStr = JSON.stringify(data);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      headers
    };
    https.get(url, options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    }).on('error', reject);
  });
}

function patchJson(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const bodyStr = JSON.stringify(data);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function run() {
  console.log("Authenticating as admin...");
  const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
  const authRes = await postJson(authUrl, { email, password, returnSecureToken: true });
  
  if (!authRes.idToken) {
    console.error("Auth failed:", authRes);
    return;
  }
  
  const token = authRes.idToken;
  console.log("✓ Authenticated successfully.");
  
  const listUrl = `https://firestore.googleapis.com/v1/projects/russell-hall-cafe/databases/(default)/documents/menuItems?pageSize=100`;
  console.log("Fetching menu items from Firestore...");
  const listRes = await getJson(listUrl, { 'Authorization': `Bearer ${token}` });
  
  if (!listRes.documents) {
    console.error("No documents found or failed to fetch:", listRes);
    return;
  }
  
  console.log(`Found ${listRes.documents.length} menu items. Checking for PNG images...`);
  
  for (const doc of listRes.documents) {
    const docPath = doc.name;
    const itemId = docPath.substring(docPath.lastIndexOf('/') + 1);
    const fields = doc.fields || {};
    
    if (fields.image && fields.image.stringValue) {
      const imgPath = fields.image.stringValue;
      if (imgPath.endsWith('.png')) {
        const filePart = imgPath.substring(imgPath.lastIndexOf('/') + 1);
        let newFilePart = customMappings[filePart];
        if (!newFilePart) {
          newFilePart = filePart.replace('.png', '.jpg');
        }
        
        const newImgPath = imgPath.substring(0, imgPath.lastIndexOf('/') + 1) + newFilePart;
        console.log(`Updating item '${itemId}': '${imgPath}' -> '${newImgPath}'`);
        
        const patchUrl = `https://firestore.googleapis.com/v1/${docPath}?updateMask.fieldPaths=image`;
        const patchBody = {
          fields: {
            image: {
              stringValue: newImgPath
            }
          }
        };
        
        try {
          const patchRes = await patchJson(patchUrl, patchBody, { 'Authorization': `Bearer ${token}` });
          if (patchRes.error) {
            console.error(`✗ Failed to update ${itemId}:`, patchRes.error);
          } else {
            console.log(`✓ Updated ${itemId} successfully.`);
          }
        } catch (err) {
          console.error(`✗ Exception updating ${itemId}:`, err.message);
        }
      }
    }
  }
  
  console.log("Migration complete!");
}

run().catch(console.error);
