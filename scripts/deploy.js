/**
 * YT Ad Helper - Automated Production Git Synchronization & Deployment Script
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_URL = 'https://github.com/upoornalakshminarayana-commits/youtube-ad-helper.git';

console.log('====================================================');
console.log('YT Ad Helper — GitHub Synchronization & Deployment');
console.log('====================================================\n');

function run(cmd, desc) {
  console.log(`[EXEC] ${desc}: ${cmd}`);
  try {
    const out = execSync(cmd, { encoding: 'utf8', cwd: path.resolve(__dirname, '..') });
    if (out.trim()) {
      console.log(out.trim());
    }
    return { success: true, output: out.trim() };
  } catch (err) {
    console.error(`[ERROR] Failed during: ${desc}`);
    console.error(err.message);
    if (err.stdout) console.log('Stdout:', err.stdout.toString());
    if (err.stderr) console.error('Stderr:', err.stderr.toString());
    return { success: false, error: err };
  }
}

// 1. Set branch to main
console.log('\n--- Step 1: Setting branch to main ---');
run('git branch -M main', 'Set branch to main');

// 2. Configure Remote Origin
console.log('\n--- Step 2: Configuring Remote Origin ---');
const remotesRes = run('git remote', 'Check remotes');
const remotes = remotesRes.output ? remotesRes.output.split('\n').map(s => s.trim()) : [];

if (remotes.includes('origin')) {
  const currentUrl = run('git remote get-url origin', 'Get origin URL').output;
  console.log(`Current origin URL: ${currentUrl}`);
  if (currentUrl !== REPO_URL) {
    run(`git remote set-url origin ${REPO_URL}`, 'Update origin URL');
  }
} else {
  run(`git remote add origin ${REPO_URL}`, 'Add origin remote');
}

// 3. Stage clean files
console.log('\n--- Step 3: Staging Production Files ---');
run('git add .', 'Stage files');

// 4. Verify staged files
console.log('\n--- Step 4: Verifying Staged Files ---');
const statusRes = run('git status --porcelain', 'Check staged files');
const stagedLines = statusRes.output.split('\n').map(l => l.trim()).filter(Boolean);

console.log(`Total staged entries: ${stagedLines.length}`);

// Strictly forbidden patterns
const FORBIDDEN = [
  'node_modules',
  'dist/',
  'build/',
  'release/',
  'out/',
  'state.json',
  '.log',
  '.tmp',
  'Thumbs.db',
  '.env',
  'push-to-github.bat'
];

let hasForbidden = false;
for (const line of stagedLines) {
  // line format: "A  path/to/file"
  const filePath = line.substring(2).trim();
  for (const pattern of FORBIDDEN) {
    if (filePath.includes(pattern)) {
      console.error(`[CRITICAL SECURITY ALERT] Forbidden file staged: ${filePath}`);
      hasForbidden = true;
    }
  }
  // Check for root duplicate extension files (e.g. "A  main-world.js")
  if (/^[A-Z\?]\s+(content\.js|main-world\.js|background\.js|manifest\.json)$/.test(line)) {
    console.error(`[ALERT] Root duplicate extension file staged: ${filePath}`);
    hasForbidden = true;
  }
}

if (hasForbidden) {
  console.error('\n[ABORT] Forbidden or duplicate files detected! Unstaging everything.');
  run('git reset', 'Unstage all');
  process.exit(1);
}

console.log('Verification passed: Only clean production files are staged.');

// 5. Commit
console.log('\n--- Step 5: Creating Production Commit ---');
run('git config user.name "upoornalakshminarayana-commits"', 'Set git user name');
run('git config user.email "upoornalakshminarayana@users.noreply.github.com"', 'Set git user email');
run('git commit -m "fix: resolve GitHub Actions Windows build failure"', 'Commit staged files');

// 6. Push to GitHub
console.log('\n--- Step 6: Pushing to GitHub (origin/main) ---');
const pushRes = run('git push origin main', 'Push to origin/main');

if (pushRes.success) {
  console.log('\n====================================================');
  console.log('SUCCESS: Repository successfully synchronized with GitHub!');
  console.log('====================================================');

  const headHash = run('git rev-parse HEAD', 'Get HEAD commit hash').output;
  console.log(`Commit Hash: ${headHash}`);
  console.log(`Repository URL: ${REPO_URL}`);
} else {
  console.error('\n[PUSH FAILED] Could not push to GitHub.');
  process.exit(1);
}
