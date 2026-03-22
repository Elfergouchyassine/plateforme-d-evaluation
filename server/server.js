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
  createdAt:   { type: Date, default: Date.now }
});
const Exercise = mongoose.model("Exercise", exerciseSchema);

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
app.get("/api/exercises", async (req, res) => {
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
app.post("/analyze", async (req, res) => {
  if (!sonarEnabled) {
    return res.status(503).json({ success: false, error: "SonarQube non configuré. Ajoutez SONARQUBE_TOKEN dans .env" });
  }
  const { code, language } = req.body;
  if (!code || !language) return res.status(400).json({ error: "Code et langage requis" });

  try {
    const fileExtension = language === "python" ? "py" : "js";
    const projectKey = `local-project-${language}`;
    const filePath = path.join(TEMP_DIR, `code_${Date.now()}.${fileExtension}`);
    fs.writeFileSync(filePath, code);

    await createSonarQubeProject(projectKey);
    await runSonarScanner(projectKey, filePath, fileExtension);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const issues = await getSonarQubeIssues(projectKey);
    const measures = await getSonarQubeMeasures(projectKey);

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({
      success: true, projectKey, issues, measures,
      stats: {
        total: issues.length,
        bugs: issues.filter(i => i.type === "BUG").length,
        vulnerabilities: issues.filter(i => i.type === "VULNERABILITY").length,
        codeSmells: issues.filter(i => i.type === "CODE_SMELL").length,
      },
    });
  } catch (err) {
    console.error("Analyse error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
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

// ================= HEALTH CHECK =================
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    port: PORT,
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    sonarqube: sonarEnabled ? SONARQUBE_URL : "disabled"
  });
});

app.get("/sonarqube-status", async (req, res) => {
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
