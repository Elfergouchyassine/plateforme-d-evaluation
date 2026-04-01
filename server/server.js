import express from "express";
import cors from "cors";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { execFile } from "child_process";
import { promisify } from "util";
import mongoose from "mongoose";
import { registerUser, loginUser } from "./auth.js";

dotenv.config();

const app = express();
const PORT = 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, "temp_code");

// ================= CONFIG CODE-RUNNER =================
const CODE_RUNNER_URL = process.env.CODE_RUNNER_URL || "http://localhost:4000";

// ================= CONFIG SONARQUBE =================
const SONARQUBE_URL = process.env.SONARQUBE_URL || "http://localhost:9000";
const SONARQUBE_TOKEN = process.env.SONARQUBE_TOKEN;
const sonarEnabled = SONARQUBE_TOKEN && SONARQUBE_TOKEN !== "placeholder";

if (!sonarEnabled) {
  console.warn("⚠️  SONARQUBE_TOKEN not set — SonarQube analysis disabled");
} else {
  console.log("✅ SonarQube configured:", SONARQUBE_URL);
}

const execFileAsync = promisify(execFile);

// ================= MIDDLEWARE =================
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// ================= MONGODB =================
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/pdrp_database";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB:", MONGO_URI))
  .catch(err => console.error("❌ MongoDB error:", err.message));

// ================= EXERCISE MODEL =================
const exerciseSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, required: true },
  language:    { type: String, default: "javascript" },
  difficulty:  { type: String, default: "Moyen" },
  classCode:   { type: String, default: "public" },
  teacherName: { type: String, required: true },
  testCode:    { type: String, default: "" },
  createdAt:   { type: Date, default: Date.now }
});
const Exercise = mongoose.model("Exercise", exerciseSchema);

// ================= SUBMISSION MODEL =================
const submissionSchema = new mongoose.Schema({
  studentEmail:    { type: String, required: true },
  exerciseId:      { type: mongoose.Schema.Types.ObjectId },
  exerciseTitle:   { type: String },
  language:        { type: String },
  noteTests:       { type: Number, default: null },
  noteSonar:       { type: Number, default: null },
  noteFinale:      { type: Number, default: null },
  testsPassés:     { type: Number, default: 0 },
  testsTotal:      { type: Number, default: 0 },
  sonarRating:     { type: String, default: null },
  sonarProjectKey: { type: String },
  submittedAt:     { type: Date, default: Date.now }
});
const Submission = mongoose.model("Submission", submissionSchema);

// ================= AUTH ROUTES =================
app.post("/api/register", (req, res) => {
  const { email, password, role = "student" } = req.body;
  const result = registerUser(email, password, role);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json({ success: true, message: "Utilisateur créé" });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const result = loginUser(email, password);
  if (result.error) return res.status(401).json({ error: result.error });
  res.json({ success: true, user: { email: result.user.email, role: result.user.role } });
});

// ================= EXERCISE ROUTES =================
app.get("/api/exercises", async (_req, res) => {
  try {
    const exercises = await Exercise.find().sort({ createdAt: -1 });
    res.json(exercises);
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

app.get("/api/exercises/class/:code", async (req, res) => {
  try {
    const exercises = await Exercise.find({ classCode: req.params.code }).sort({ createdAt: -1 });
    res.json(exercises);
  } catch (err) { res.status(500).json({ error: "Erreur recherche" }); }
});

app.post("/api/exercises", async (req, res) => {
  try {
    const newEx = new Exercise(req.body);
    await newEx.save();
    res.status(201).json(newEx);
  } catch (err) { res.status(500).json({ error: "Champs obligatoires manquants" }); }
});

app.put("/api/exercises/:id", async (req, res) => {
  try {
    const updatedEx = await Exercise.findByIdAndUpdate(req.params.id, req.body, { returnDocument: "after" });
    res.json(updatedEx);
  } catch (err) { res.status(500).json({ error: "Erreur modification" }); }
});

app.delete("/api/exercises/:id", async (req, res) => {
  try {
    await Exercise.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Erreur suppression" }); }
});

// ================= SONARQUBE ROUTES =================

// Reusable analysis function — called by /analyze and /api/submit
async function performSonarAnalysis(code, language, projectKey = null) {
  if (!sonarEnabled) throw new Error("SonarQube non configuré. Ajoutez SONARQUBE_TOKEN dans .env");

  const fileExtension = language === "python" ? "py" : "js";
  const key = projectKey || `local-project-${language}`;
  const filePath = path.join(TEMP_DIR, `code_${Date.now()}.${fileExtension}`);
  fs.writeFileSync(filePath, code);

  await createSonarQubeProject(key);
  await runSonarScanner(key, filePath, fileExtension);
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const issues = await getSonarQubeIssues(key);
  const measures = await getSonarQubeMeasures(key);

  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  return {
    success: true, projectKey: key, issues, measures,
    stats: {
      total: issues.length,
      bugs: issues.filter(i => i.type === "BUG").length,
      vulnerabilities: issues.filter(i => i.type === "VULNERABILITY").length,
      codeSmells: issues.filter(i => i.type === "CODE_SMELL").length,
    },
  };
}

app.post("/analyze", async (req, res) => {
  const { code, language } = req.body;
  if (!code || !language) return res.status(400).json({ error: "Code et langage requis" });
  try {
    const result = await performSonarAnalysis(code, language);
    res.json(result);
  } catch (err) {
    console.error("Analyse error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= CODE RUNNER ROUTES =================

// POST /api/execute — simple code execution (no tests, no SonarQube)
app.post("/api/execute", async (req, res) => {
  const { studentCode, language } = req.body;
  if (!studentCode || !language) return res.status(400).json({ error: "studentCode et language requis" });
  try {
    const r = await axios.post(`${CODE_RUNNER_URL}/execute`, { code: studentCode, language }, { timeout: 15000 });
    res.json(r.data);
  } catch (err) {
    res.json({ stdout: "", stderr: err.message });
  }
});

// POST /api/run-tests — test student code against exercise's test suite
app.post("/api/run-tests", async (req, res) => {
  const { exerciseId, studentCode, language } = req.body;
  if (!exerciseId || !studentCode) {
    return res.status(400).json({ error: "exerciseId et studentCode requis" });
  }
  try {
    const exercise = await Exercise.findById(exerciseId);
    if (!exercise) return res.status(404).json({ error: "Exercice introuvable" });
    if (!exercise.testCode) return res.status(400).json({ error: "Cet exercice n'a pas de tests définis" });

    const r = await axios.post(`${CODE_RUNNER_URL}/test`, {
      studentCode,
      testCode: exercise.testCode,
      language: language || exercise.language,
    }, { timeout: 25000 });

    res.json(r.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, tests: [], passed: 0, total: 0, failed: 0 });
  }
});

// POST /api/submit — final submission: execute + tests + SonarQube + grade
app.post("/api/submit", async (req, res) => {
  const { studentCode, language, exerciseId, studentEmail } = req.body;
  if (!studentCode || !language) return res.status(400).json({ error: "studentCode et language requis" });

  // Build unique SonarQube projectKey per student + exercise
  const studentSlug = (studentEmail || "anonymous").replace(/[@.]/g, "_");
  const projectKey = `proj-${studentSlug}-${exerciseId || "noex"}-${language}`;

  // Fetch exercise (for tests + title)
  let exercise = null;
  if (exerciseId) {
    try { exercise = await Exercise.findById(exerciseId); } catch (_) {}
  }

  // Run execution, tests (if any), and SonarQube in parallel
  const tasks = [
    axios.post(`${CODE_RUNNER_URL}/execute`, { code: studentCode, language }, { timeout: 15000 }),
    performSonarAnalysis(studentCode, language, projectKey),
  ];
  if (exercise?.testCode) {
    tasks.push(
      axios.post(`${CODE_RUNNER_URL}/test`, {
        studentCode, testCode: exercise.testCode, language
      }, { timeout: 25000 })
    );
  }

  const [execResult, sonarResult, testResult] = await Promise.allSettled(tasks);

  // ── Grade calculation ──────────────────────────────────────────────
  const sonarData = sonarResult.status === "fulfilled" ? sonarResult.value : null;
  const testData  = testResult?.status === "fulfilled"  ? testResult.value.data : null;

  const ratingMap = { "1": 10, "2": 8, "3": 6, "4": 4, "5": 2 };
  const ratingLetterMap = { "1": "A", "2": "B", "3": "C", "4": "D", "5": "E" };
  const sqaleRaw = sonarData?.measures?.find(m => m.metric === "sqale_rating")?.value || "5";
  const noteSonar = ratingMap[sqaleRaw] ?? 2;
  const ratingLetter = ratingLetterMap[sqaleRaw] ?? "E";

  const hasTests  = Boolean(exercise?.testCode);
  const testsPassés = testData?.passed ?? 0;
  const testsTotal  = testData?.total  ?? 0;
  const noteTests = hasTests && testsTotal > 0
    ? Math.round((testsPassés / testsTotal) * 10 * 10) / 10
    : null;

  const noteFinale = noteTests !== null
    ? Math.round((noteTests + noteSonar) * 10) / 10
    : Math.round(noteSonar * 2 * 10) / 10;

  // ── Upsert submission ──────────────────────────────────────────────
  if (studentEmail) {
    await Submission.findOneAndUpdate(
      { studentEmail, exerciseId: exerciseId || null },
      {
        studentEmail,
        exerciseId:    exerciseId || null,
        exerciseTitle: exercise?.title || "—",
        language,
        noteTests,
        noteSonar,
        noteFinale,
        testsPassés,
        testsTotal,
        sonarRating:     ratingLetter,
        sonarProjectKey: projectKey,
        submittedAt:     new Date(),
      },
      { upsert: true, new: true }
    ).catch(err => console.error("Submission save error:", err.message));
  }

  res.json({
    execution: execResult.status === "fulfilled"
      ? execResult.value.data
      : { stdout: "", stderr: execResult.reason?.message || "Erreur d'exécution" },
    sonar: sonarData || { success: false, error: sonarResult.reason?.message },
    tests: testData || null,
    grade: { noteTests, noteSonar, noteFinale, ratingLetter, hasTests },
  });
});

// GET /api/submissions — all submissions for teacher view
app.get("/api/submissions", async (_req, res) => {
  try {
    const submissions = await Submission.find().sort({ submittedAt: -1 });
    res.json(submissions);
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

async function createSonarQubeProject(projectKey) {
  try {
    await axios.post(
      `${SONARQUBE_URL}/api/projects/create?project=${projectKey}&name=${projectKey}`,
      {}, { auth: { username: SONARQUBE_TOKEN, password: "" } }
    );
  } catch (err) {
    if (err.response?.status !== 400) throw err;
  }
}

async function runSonarScanner(projectKey, filePath, fileExtension) {
  const projectDir = path.join(TEMP_DIR, `scan-${Math.random().toString(36).slice(2)}`);
  const srcDir = path.join(projectDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.copyFileSync(filePath, path.join(srcDir, `code.${fileExtension}`));

  const args = [
    `-Dsonar.projectKey=${projectKey}`,
    `-Dsonar.sources=src`,
    `-Dsonar.host.url=${SONARQUBE_URL}`,
    `-Dsonar.login=${SONARQUBE_TOKEN}`,
    `-Dsonar.working.directory=/root/.sonar/work`,
    `-Dsonar.scanner.skipJreProvisioning=true`,
    `-Dsonar.tests=`, `-Dsonar.test.inclusions=`,
    `-Dsonar.javascript.lcov.reportPaths=`,
    `-Dsonar.python.coverage.reportPaths=`,
    `-Dsonar.scm.disabled=true`,
  ];

  try {
    await execFileAsync("sonar-scanner", args, { cwd: projectDir });
  } catch (err) {
    console.error("sonar-scanner failed:", err.message);
    throw err;
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

async function getSonarQubeIssues(projectKey) {
  try {
    const r = await axios.get(`${SONARQUBE_URL}/api/issues/search?projectKeys=${projectKey}`,
      { auth: { username: SONARQUBE_TOKEN, password: "" }, timeout: 10000 });
    return r.data.issues || [];
  } catch (err) { return []; }
}

async function getSonarQubeMeasures(projectKey) {
  try {
    const metricKeys = "sqale_index,sqale_rating,code_smells,bugs,vulnerabilities,reliability_rating,security_rating,sqale_debt_ratio";
    const r = await axios.get(
      `${SONARQUBE_URL}/api/measures/component?component=${projectKey}&metricKeys=${metricKeys}`,
      { auth: { username: SONARQUBE_TOKEN, password: "" }, timeout: 10000 });
    return r.data?.component?.measures || [];
  } catch (err) { return []; }
}

// ================= SONARQUBE DETAIL ROUTES =================

// Returns enriched issues with rule details (why + location) for a project
app.get("/api/sonar/issues/:projectKey", async (req, res) => {
  if (!sonarEnabled) return res.status(503).json({ error: "SonarQube non configuré" });
  try {
    const { projectKey } = req.params;
    // 1. Fetch issues
    const issuesRes = await axios.get(
      `${SONARQUBE_URL}/api/issues/search?projectKeys=${projectKey}&ps=50`,
      { auth: { username: SONARQUBE_TOKEN, password: "" }, timeout: 10000 }
    );
    const issues = issuesRes.data.issues || [];

    // 2. Enrich each issue with rule details (why is this an issue?)
    const enriched = await Promise.all(issues.map(async (issue) => {
      try {
        const ruleRes = await axios.get(
          `${SONARQUBE_URL}/api/rules/show?key=${issue.rule}`,
          { auth: { username: SONARQUBE_TOKEN, password: "" }, timeout: 8000 }
        );
        const rule = ruleRes.data.rule || {};
        return {
          key: issue.key,
          rule: issue.rule,
          severity: issue.severity,
          type: issue.type,
          message: issue.message,
          // WHERE
          component: issue.component,
          line: issue.line,
          textRange: issue.textRange,
          // WHY
          ruleName: rule.name,
          ruleDesc: rule.htmlDesc || rule.mdDesc || "",
          tags: issue.tags || [],
          effort: issue.effort,
          status: issue.status,
        };
      } catch {
        return {
          key: issue.key,
          rule: issue.rule,
          severity: issue.severity,
          type: issue.type,
          message: issue.message,
          component: issue.component,
          line: issue.line,
          textRange: issue.textRange,
          ruleName: issue.rule,
          ruleDesc: "",
          tags: issue.tags || [],
          effort: issue.effort,
          status: issue.status,
        };
      }
    }));

    res.json({ success: true, issues: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Returns source lines with highlighting for a component
app.get("/api/sonar/source/:projectKey", async (req, res) => {
  if (!sonarEnabled) return res.status(503).json({ error: "SonarQube non configuré" });
  try {
    const component = req.query.component;
    if (!component) return res.status(400).json({ error: "component requis" });

    const r = await axios.get(
      `${SONARQUBE_URL}/api/sources/lines?key=${component}`,
      { auth: { username: SONARQUBE_TOKEN, password: "" }, timeout: 8000 }
    );
    res.json({ success: true, sources: r.data.sources || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= HEALTH CHECK =================
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    port: PORT,
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    sonarqube: sonarEnabled ? SONARQUBE_URL : "disabled"
  });
});

app.get("/sonarqube-status", async (_req, res) => {
  if (!sonarEnabled) return res.json({ sonarqube: "disabled" });
  try {
    const r = await axios.get(`${SONARQUBE_URL}/api/system/status`, { timeout: 5000 });
    res.json({ sonarqube: "connected", status: r.data.status, version: r.data.version });
  } catch (err) {
    res.status(500).json({ sonarqube: "disconnected", error: err.message });
  }
});

// ================= START =================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend running on http://0.0.0.0:${PORT}`);
});