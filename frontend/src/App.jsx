import React, { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { linter, lintGutter } from "@codemirror/lint";
import "./App.css";
import { parseSonarQubeReport, mapDiagnosticsToContent } from "./utils/education";

const API_URL = "http://localhost:5000";

// =============================================
//  AUTH HELPERS  (from your part)
// =============================================
function getAuthFromURL() {
  const params = new URLSearchParams(window.location.search);
  const role = params.get("role");
  if (role) {
    localStorage.setItem("userRole", role);
    localStorage.setItem("isLoggedIn", "true");
    // Clean URL
    window.history.replaceState({}, "", "/");
  }
  return {
    role: localStorage.getItem("userRole"),
    isLoggedIn: localStorage.getItem("isLoggedIn") === "true",
  };
}

function logout() {
  localStorage.clear();
  window.location.href = "http://localhost:3000";
}

// =============================================
//  STUDENT VIEW  (from friend's App.jsx)
// =============================================
function StudentView({ exercises, classCode }) {
  const [value, setValue] = useState(`// Écrivez votre code JavaScript ici\nconsole.log("Hello!");`);
  const [lang, setLang] = useState("javascript");
  const [output, setOutput] = useState("");
  const [eduContent, setEduContent] = useState([]);
  const [sonarResults, setSonarResults] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (exercises.length > 0) setSelectedExercise(exercises[0]);
  }, [exercises]);

  // ---- Python Linter ----
  const pythonLinter = linter((view) => {
    const code = view.state.doc.toString();
    const diagnostics = [];
    const lines = code.split("\n");

    if (code.includes("print(") && !code.includes(")")) {
      diagnostics.push({
        from: code.indexOf("print("),
        to: code.indexOf("print(") + 6,
        severity: "error",
        message: "Erreur de syntaxe : parenthèse fermante manquante.",
      });
    }

    lines.forEach((line, index) => {
      const singleQuotes = (line.match(/'/g) || []).length;
      const doubleQuotes = (line.match(/"/g) || []).length;
      if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
        const from = code.split("\n").slice(0, index).join("\n").length + (index > 0 ? 1 : 0);
        diagnostics.push({ from, to: from + line.length, severity: "error", message: "Guillemets non fermés" });
      }
      const trimmed = line.trim();
      if (/^(if|for|while|def|class)\s+.+[^:]$/.test(trimmed)) {
        const from = code.split("\n").slice(0, index).join("\n").length + (index > 0 ? 1 : 0);
        diagnostics.push({ from, to: from + line.length, severity: "error", message: "':' manquant à la fin de la ligne" });
      }
    });

    return diagnostics;
  });

  // ---- JS Linter ----
  const jsLinter = linter((view) => {
    const code = view.state.doc.toString();
    const diagnostics = [];
    const openBraces = (code.match(/{/g) || []).length;
    const closeBraces = (code.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      diagnostics.push({ from: 0, to: code.length, severity: "error", message: `Accolades non appariées: ${openBraces} ouvertes, ${closeBraces} fermées` });
    }
    const openParens = (code.match(/\(/g) || []).length;
    const closeParens = (code.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      diagnostics.push({ from: 0, to: code.length, severity: "error", message: `Parenthèses non appariées: ${openParens} ouvertes, ${closeParens} fermées` });
    }
    return diagnostics;
  });

  const languageExtension =
    lang === "python"
      ? [python(), pythonLinter, lintGutter()]
      : [javascript({ jsx: true }), jsLinter, lintGutter()];

  async function sendToJudge0() {
    setLoading(true);
    setOutput("Exécution en cours...");
    setEduContent([]);
    setSonarResults(null);
    const languageId = lang === "javascript" ? 63 : 71;

    try {
      const response = await fetch("https://ce.judge0.com/submissions?base64_encoded=false&wait=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_code: value, language_id: languageId, stdin: "" }),
      });
      const result = await response.json();
      if (result.stdout) setOutput(result.stdout);
      else if (result.stderr) setOutput("Erreur:\n" + result.stderr);
      else if (result.compile_output) setOutput("Erreur de compilation:\n" + result.compile_output);
      else setOutput(JSON.stringify(result, null, 2));

      await analyzeSonarQube();
    } catch (err) {
      setOutput("Erreur de connexion à Judge0 : " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function analyzeSonarQube() {
    try {
      const response = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value, language: lang }),
      });
      const result = await response.json();
      setSonarResults(result);
      const diagnostics = parseSonarQubeReport(result);
      setEduContent(mapDiagnosticsToContent(diagnostics));
    } catch (err) {
      console.error("Erreur SonarQube:", err);
    }
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Plateforme d'évaluation de programmation</h1>
        <div className="controls">
          <label>
            Langage :
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
            </select>
          </label>
          <button className="btn-execute" onClick={sendToJudge0} disabled={loading}>
            {loading ? "⏳ En cours..." : "▶ Exécuter"}
          </button>
          <button className="btn-logout" onClick={logout}>🚪 Déconnexion</button>
        </div>
      </header>

      <main className="main-container">
        <div className="left-section">
          {/* Exercise selector */}
          {exercises.length > 0 && (
            <div className="exercise-selector">
              <label>Exercice :
                <select onChange={(e) => setSelectedExercise(exercises.find(ex => ex._id === e.target.value))}>
                  {exercises.map(ex => (
                    <option key={ex._id} value={ex._id}>{ex.title}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="editor-section">
            <h2>Éditeur de code</h2>
            <CodeMirror
              value={value}
              height="400px"
              extensions={languageExtension}
              onChange={(val) => setValue(val)}
              basicSetup={true}
            />
          </div>
        </div>

        <div className="right-section">
          <div className="exercise-section">
            {selectedExercise ? (
              <>
                <h2>{selectedExercise.title}</h2>
                <div className="exercise-meta">
                  <span className="badge">{selectedExercise.difficulty}</span>
                  <span className="badge">{selectedExercise.language}</span>
                  {selectedExercise.classCode !== "public" && (
                    <span className="badge badge-class">Classe: {selectedExercise.classCode}</span>
                  )}
                </div>
                <p className="exercise-description">{selectedExercise.description}</p>
              </>
            ) : (
              <p>Aucun exercice disponible pour votre classe.</p>
            )}

            {/* SonarQube results */}
            {sonarResults && (
              <div className="sonar-results">
                <h3>📊 Analyse de qualité (SonarQube)</h3>
                <p><strong>Total issues :</strong> {sonarResults.stats?.total || 0}</p>
                <p><strong>🐛 Bugs :</strong> {sonarResults.stats?.bugs || 0}</p>
                <p><strong>🔒 Vulnérabilités :</strong> {sonarResults.stats?.vulnerabilities || 0}</p>
                <p><strong>💨 Code Smells :</strong> {sonarResults.stats?.codeSmells || 0}</p>
              </div>
            )}

            {/* Educational content */}
            {eduContent.length > 0 && (
              <div className="edu-content">
                <h3>📚 Ressources recommandées</h3>
                {eduContent.map((c) => (
                  <div key={c.key} className="edu-card">
                    <strong>{c.title}</strong>
                    <p>{c.explanation}</p>
                    <pre>{c.example}</pre>
                    <p><em>Fix :</em> {c.fix}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="output-section">
        <h3>Résultat d'exécution</h3>
        <pre className="output-box">{output}</pre>
      </footer>
    </div>
  );
}

// =============================================
//  TEACHER VIEW  (from your backend + new UI)
// =============================================
function TeacherView() {
  const [exercises, setExercises] = useState([]);
  const [form, setForm] = useState({ title: "", description: "", language: "javascript", difficulty: "Moyen", classCode: "public", teacherName: "" });
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => { fetchExercises(); }, []);

  async function fetchExercises() {
    try {
      const res = await fetch(`${API_URL}/api/exercises`);
      const data = await res.json();
      setExercises(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `${API_URL}/api/exercises/${editId}` : `${API_URL}/api/exercises`;
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setMsg(editId ? "✅ Exercice modifié" : "✅ Exercice créé");
      setEditId(null);
      setForm({ title: "", description: "", language: "javascript", difficulty: "Moyen", classCode: "public", teacherName: "" });
      fetchExercises();
    } catch (err) {
      setMsg("❌ Erreur: " + err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer cet exercice ?")) return;
    await fetch(`${API_URL}/api/exercises/${id}`, { method: "DELETE" });
    fetchExercises();
  }

  function handleEdit(ex) {
    setEditId(ex._id);
    setForm({ title: ex.title, description: ex.description, language: ex.language, difficulty: ex.difficulty, classCode: ex.classCode, teacherName: ex.teacherName });
  }

  return (
    <div className="teacher-container">
      <header className="app-header">
        <h1>Interface Enseignant</h1>
        <button className="btn-logout" onClick={logout}>🚪 Déconnexion</button>
      </header>

      <main style={{ display: "flex", gap: 24, padding: 24 }}>
        {/* Form */}
        <div style={{ flex: 1, background: "#fff", padding: 24, borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,.1)" }}>
          <h2>{editId ? "✏️ Modifier l'exercice" : "➕ Créer un exercice"}</h2>
          {msg && <p style={{ color: msg.startsWith("✅") ? "green" : "red" }}>{msg}</p>}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input placeholder="Titre *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
            <textarea placeholder="Description *" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} required />
            <input placeholder="Votre nom (professeur) *" value={form.teacherName} onChange={e => setForm({ ...form, teacherName: e.target.value })} required />
            <label>Langage :
              <select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}>
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
              </select>
            </label>
            <label>Difficulté :
              <select value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}>
                <option>Facile</option>
                <option>Moyen</option>
                <option>Difficile</option>
              </select>
            </label>
            <input placeholder="Code de classe (ex: CM1, ou 'public')" value={form.classCode} onChange={e => setForm({ ...form, classCode: e.target.value })} />
            <button type="submit" style={{ background: "#2563eb", color: "white", padding: 12, border: "none", borderRadius: 6, cursor: "pointer" }}>
              {editId ? "Mettre à jour" : "Publier l'exercice"}
            </button>
            {editId && <button type="button" onClick={() => { setEditId(null); setForm({ title: "", description: "", language: "javascript", difficulty: "Moyen", classCode: "public", teacherName: "" }); }}>Annuler</button>}
          </form>
        </div>

        {/* Exercise list */}
        <div style={{ flex: 2 }}>
          <h2>📋 Exercices publiés ({exercises.length})</h2>
          {exercises.length === 0 ? <p>Aucun exercice pour l'instant.</p> : exercises.map(ex => (
            <div key={ex._id} style={{ background: "#fff", padding: 16, marginBottom: 12, borderRadius: 8, boxShadow: "0 2px 6px rgba(0,0,0,.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <strong>{ex.title}</strong>
                  <span style={{ marginLeft: 8, fontSize: 12, background: "#dbeafe", padding: "2px 8px", borderRadius: 4 }}>{ex.language}</span>
                  <span style={{ marginLeft: 4, fontSize: 12, background: "#d1fae5", padding: "2px 8px", borderRadius: 4 }}>{ex.difficulty}</span>
                  <span style={{ marginLeft: 4, fontSize: 12, background: "#fef3c7", padding: "2px 8px", borderRadius: 4 }}>Classe: {ex.classCode}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => handleEdit(ex)} style={{ background: "#f59e0b", color: "white", border: "none", padding: "6px 12px", borderRadius: 4, cursor: "pointer" }}>✏️ Modifier</button>
                  <button onClick={() => handleDelete(ex._id)} style={{ background: "#ef4444", color: "white", border: "none", padding: "6px 12px", borderRadius: 4, cursor: "pointer" }}>🗑️ Supprimer</button>
                </div>
              </div>
              <p style={{ margin: "8px 0 0", color: "#555", fontSize: 14 }}>{ex.description.slice(0, 120)}{ex.description.length > 120 ? "..." : ""}</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#888" }}>Prof: {ex.teacherName}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

// =============================================
//  ROOT APP
// =============================================
export default function App() {
  const [authState, setAuthState] = useState(null);
  const [exercises, setExercises] = useState([]);

  useEffect(() => {
    const auth = getAuthFromURL();
    if (!auth.isLoggedIn) {
      window.location.href = "http://localhost:3000";
      return;
    }
    setAuthState(auth);

    // Load exercises for students
    if (auth.role === "student") {
      const classCode = localStorage.getItem("classCode") || "public";
      fetch(`${API_URL}/api/exercises/class/${classCode}`)
        .then(r => r.json())
        .then(data => setExercises(Array.isArray(data) ? data : []))
        .catch(() => setExercises([]));
    }
  }, []);

  if (!authState) return <div style={{ textAlign: "center", marginTop: 80 }}>Chargement...</div>;

  if (authState.role === "teacher") return <TeacherView />;
  return <StudentView exercises={exercises} />;
}
