const { execFile } = require('child_process');
const fs = require('fs');

const paths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];

let foundPath = null;
for (const p of paths) {
  if (fs.existsSync(p)) {
    foundPath = p;
    break;
  }
}

if (!foundPath) {
  console.error("No browser found.");
  process.exit(1);
}

console.log(`Using browser: ${foundPath}`);
const screenshotPath = 'C:\\Users\\shyam\\Downloads\\Russell Hall cafe\\scratch\\test_result.png';

// Clean old screenshot if exists
if (fs.existsSync(screenshotPath)) {
  fs.unlinkSync(screenshotPath);
}

const args = [
  '--headless',
  '--disable-gpu',
  `--screenshot=${screenshotPath}`,
  '--window-size=1280,1600',
  '--virtual-time-budget=20000', // Allow 20 seconds of virtual execution time for page reload and processing
  'https://russell-hall-cafe-user.pages.dev/test_flow.html'
];

console.log("Running headless browser on live site...");
execFile(foundPath, args, (err, stdout, stderr) => {
  if (err) {
    console.error("Error running browser:", err);
    process.exit(1);
  }
  console.log("Headless test run completed!");
  if (fs.existsSync(screenshotPath)) {
    console.log(`Screenshot created successfully: ${screenshotPath}`);
    console.log(`File size: ${fs.statSync(screenshotPath).size} bytes`);
  } else {
    console.error("Screenshot was not created. Page might have crashed or timed out.");
  }
});
