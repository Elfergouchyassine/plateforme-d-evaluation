const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const execFileAsync = promisify(execFile);
const app = express();
app.use(express.json({ limit: '5mb' }));

const JEST_BIN = path.join(__dirname, 'node_modules', '.bin', 'jest');
const EXEC_TIMEOUT = 10000;  // 10s for simple execution
const TEST_TIMEOUT = 20000;  // 20s for test runs
const MAX_BUFFER = 1024 * 1024; // 1MB output cap

function makeTmpDir() {
  const dir = `/tmp/run_${crypto.randomBytes(8).toString('hex')}`;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── POST /execute ─────────────────────────────────────────────────────────
// Replaces Judge0: run student code and return stdout/stderr
app.post('/execute', async (req, res) => {
  const { code, language } = req.body;
  if (!code || !language) return res.status(400).json({ error: 'code and language required' });

  const dir = makeTmpDir();
  try {
    let result;
    if (language === 'python') {
      fs.writeFileSync(path.join(dir, 'solution.py'), code);
      result = await execFileAsync('python3', ['solution.py'], {
        cwd: dir, timeout: EXEC_TIMEOUT, maxBuffer: MAX_BUFFER
      }).catch(e => ({ stdout: e.stdout || '', stderr: e.stderr || e.message }));
    } else {
      fs.writeFileSync(path.join(dir, 'solution.js'), code);
      result = await execFileAsync('node', ['solution.js'], {
        cwd: dir, timeout: EXEC_TIMEOUT, maxBuffer: MAX_BUFFER
      }).catch(e => ({ stdout: e.stdout || '', stderr: e.stderr || e.message }));
    }
    res.json({ stdout: result.stdout || '', stderr: result.stderr || '' });
  } catch (err) {
    res.json({ stdout: '', stderr: err.message });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── POST /test ─────────────────────────────────────────────────────────────
// Run student code against professor's unit tests
app.post('/test', async (req, res) => {
  const { studentCode, testCode, language } = req.body;
  if (!studentCode || !testCode || !language) {
    return res.status(400).json({ error: 'studentCode, testCode and language required' });
  }

  const dir = makeTmpDir();
  try {
    if (language === 'python') {
      fs.writeFileSync(path.join(dir, 'solution.py'), studentCode);
      fs.writeFileSync(path.join(dir, 'test_solution.py'), testCode);

      await execFileAsync(
        'python3',
        ['-m', 'pytest', 'test_solution.py', '-v', '--tb=short',
          '--json-report', '--json-report-file=result.json'],
        { cwd: dir, timeout: TEST_TIMEOUT, maxBuffer: MAX_BUFFER }
      ).catch(() => {}); // pytest exits with code 1 on failures — ignore the error

      const resultPath = path.join(dir, 'result.json');
      if (fs.existsSync(resultPath)) {
        const report = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
        return res.json({ success: true, ...parsePytest(report) });
      }
      return res.json({ success: false, error: 'pytest did not produce output', tests: [], passed: 0, total: 0, failed: 0 });

    } else {
      // JavaScript — Jest
      fs.writeFileSync(path.join(dir, 'solution.js'), studentCode);
      fs.writeFileSync(path.join(dir, 'solution.test.js'), testCode);
      // Minimal package.json so Jest doesn't look for one up the tree
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));

      const rawResult = await execFileAsync(
        JEST_BIN,
        ['solution.test.js', '--json', '--no-coverage', '--rootDir', dir, '--testEnvironment', 'node'],
        {
          cwd: dir, timeout: TEST_TIMEOUT, maxBuffer: MAX_BUFFER,
          env: { ...process.env, NODE_PATH: path.join(__dirname, 'node_modules') }
        }
      ).catch(e => ({ stdout: e.stdout || '', stderr: e.stderr || '' }));

      try {
        const report = JSON.parse(rawResult.stdout);
        return res.json({ success: true, ...parseJest(report) });
      } catch {
        return res.json({
          success: false,
          error: rawResult.stderr || rawResult.stdout || 'Jest failed to run',
          tests: [], passed: 0, total: 0, failed: 0
        });
      }
    }
  } catch (err) {
    res.json({ success: false, error: err.message, tests: [], passed: 0, total: 0, failed: 0 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Parsers ─────────────────────────────────────────────────────────────────
function parseJest(report) {
  const tests = [];
  for (const suite of report.testResults || []) {
    for (const t of suite.testResults || []) {
      tests.push({
        name: t.fullName,
        passed: t.status === 'passed',
        error: t.failureMessages?.join('\n') || null,
        duration: t.duration ?? null
      });
    }
  }
  const passed = tests.filter(t => t.passed).length;
  return { tests, passed, total: tests.length, failed: tests.length - passed };
}

function parsePytest(report) {
  const tests = [];
  for (const t of report.tests || []) {
    tests.push({
      name: t.nodeid,
      passed: t.outcome === 'passed',
      error: t.call?.longrepr || null,
      duration: t.call?.duration ? Math.round(t.call.duration * 1000) : null
    });
  }
  const passed = tests.filter(t => t.passed).length;
  return { tests, passed, total: tests.length, failed: tests.length - passed };
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.listen(4000, '0.0.0.0', () => console.log('🚀 code-runner listening on port 4000'));
