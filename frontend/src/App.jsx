import React, { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { linter, lintGutter } from "@codemirror/lint";
import { vscodeDark } from "@uiw/codemirror-theme-vscode"; // Ajout du thème pour un meilleur design
import "./App.css";
import { parseSonarQubeReport, mapDiagnosticsToContent } from "./utils/education";

const API_URL = "http://localhost:5000";

// =============================================
//  AUTH HELPERS
// =============================================
function getAuthFromURL() {
  const params = new URLSearchParams(window.location.search);
  const role = params.get("role");
  if (role) {
    localStorage.setItem("userRole", role);
    localStorage.setItem("isLoggedIn", "true");
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
//  STUDENT VIEW (Utilisé par l'étudiant ET pour l'aperçu prof)
// =============================================
function StudentView({ exercises, isPreview = false, onBack }) {
  const [value, setValue] = useState(`// Écrivez votre code ici\nconsole.log("Hello!");`);
  const [lang, setLang] = useState("javascript");
  const [output, setOutput] = useState("");
  const [eduContent, setEduContent] = useState([]);
  const [sonarResults, setSonarResults] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (exercises.length > 0) setSelectedExercise(exercises[0]);
  }, [exercises]);

  // Extensions du langage
  const languageExtension = lang === "python" ? [python()] : [javascript({ jsx: true })];

  async function sendToJudge0() {
    setLoading(true);
    setOutput("Exécution en cours...");
    try {
      const response = await fetch("https://ce.judge0.com/submissions?base64_encoded=false&wait=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_code: value, language_id: lang === "javascript" ? 63 : 71 }),
      });
      const result = await response.json();
      setOutput(result.stdout || result.stderr || "Erreur d'exécution");
      await analyzeSonarQube();
    } catch (err) {
      setOutput("Erreur Judge0");
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
      setEduContent(mapDiagnosticsToContent(parseSonarQubeReport(result)));
    } catch (err) { console.error(err); }
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>{isPreview ? "Aperçu : Mode Étudiant" : "Plateforme d'évaluation"}</h1>
        <div className="controls">
          {isPreview && <button className="btn-back" onClick={onBack} style={{marginRight: '10px', background: '#6b7280'}}>⬅ Retour Gestion</button>}
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
          </select>
          <button className="btn-execute" onClick={sendToJudge0} disabled={loading}>▶ Exécuter</button>
          {!isPreview && <button className="btn-logout" onClick={logout}>🚪 Déconnexion</button>}
        </div>
      </header>
      <main className="main-container">
        <div className="left-section">
          {exercises.length > 0 && (
            <div className="exercise-selector">
              <label>Choisir un exercice :
                <select onChange={(e) => setSelectedExercise(exercises.find(ex => ex._id === e.target.value))}>
                  {exercises.map(ex => <option key={ex._id} value={ex._id}>{ex.title}</option>)}
                </select>
              </label>
            </div>
          )}
          <div className="editor-section">
            <CodeMirror value={value} height="400px" theme={vscodeDark} extensions={languageExtension} onChange={(val) => setValue(val)} />
          </div>
        </div>
        <div className="right-section">
          <div className="exercise-section">
            {selectedExercise ? (
              <>
                <h2>{selectedExercise.title}</h2>
                <p>{selectedExercise.description}</p>
                <small>Difficulté: {selectedExercise.difficulty} | Prof: {selectedExercise.teacherName}</small>
              </>
            ) : <p>Aucun exercice chargé.</p>}
          </div>
          <footer className="output-section">
            <h3>Console</h3>
            <pre className="output-box">{output}</pre>
          </footer>
        </div>
      </main>
    </div>
  );
}

// =============================================
//  TEACHER VIEW (Avec bouton Switch)
// =============================================
function TeacherView({ exercises, fetchExercises }) {
  const [viewMode, setViewMode] = useState("manage"); // "manage" ou "preview"
  const [form, setForm] = useState({ title: "", description: "", language: "javascript", difficulty: "Moyen", classCode: "public", teacherName: "" });
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    const method = editId ? "PUT" : "POST";
    const url = editId ? `${API_URL}/api/exercises/${editId}` : `${API_URL}/api/exercises`;
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setMsg("✅ Succès !");
    setEditId(null);
    setForm({ title: "", description: "", language: "javascript", difficulty: "Moyen", classCode: "public", teacherName: "" });
    fetchExercises();
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer ?")) return;
    await fetch(`${API_URL}/api/exercises/${id}`, { method: "DELETE" });
    fetchExercises();
  }

  // Si le prof veut voir l'aperçu étudiant
  if (viewMode === "preview") {
    return <StudentView exercises={exercises} isPreview={true} onBack={() => setViewMode("manage")} />;
  }

  return (
    <div className="teacher-container">
      <header className="app-header">
        <h1>Interface Enseignant</h1>
        <div className="controls">
          <button onClick={() => setViewMode("preview")} style={{background: '#10b981', color: 'white', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer', marginRight: '10px'}}>
            👁️ Aperçu Étudiant
          </button>
          <button className="btn-logout" onClick={logout}>🚪 Déconnexion</button>
        </div>
      </header>

      <main style={{ display: "flex", gap: 24, padding: 24 }}>
        {/* Formulaire de création */}
        <div style={{ flex: 1, background: "#fff", padding: 24, borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,.1)" }}>
          <h2>{editId ? "✏️ Modifier" : "➕ Créer un exercice"}</h2>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input placeholder="Titre *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
            <textarea placeholder="Description *" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} required />
            <input placeholder="Votre nom *" value={form.teacherName} onChange={e => setForm({ ...form, teacherName: e.target.value })} required />
            <button type="submit" style={{ background: "#2563eb", color: "white", padding: 12, border: "none", borderRadius: 6, cursor: "pointer" }}>
              {editId ? "Mettre à jour" : "Publier"}
            </button>
          </form>
        </div>

        {/* Liste des exercices */}
        <div style={{ flex: 2 }}>
          <h2>📋 Mes Exercices ({exercises.length})</h2>
          {exercises.map(ex => (
            <div key={ex._id} style={{ background: "#fff", padding: 16, marginBottom: 12, borderRadius: 8, boxShadow: "0 2px 6px rgba(0,0,0,.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{ex.title}</strong>
                <div>
                  <button onClick={() => {setEditId(ex._id); setForm(ex);}} style={{background: 'orange', border: 'none', color: 'white', marginRight: '5px'}}>✏️</button>
                  <button onClick={() => handleDelete(ex._id)} style={{background: 'red', border: 'none', color: 'white'}}>🗑️</button>
                </div>
              </div>
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
    fetchExercises();
  }, []);

  async function fetchExercises() {
    try {
      const res = await fetch(`${API_URL}/api/exercises`);
      const data = await res.json();
      setExercises(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); }
  }

  if (!authState) return <div style={{ textAlign: "center", marginTop: 80 }}>Chargement...</div>;

  return authState.role === "teacher" 
    ? <TeacherView exercises={exercises} fetchExercises={fetchExercises} /> 
    : <StudentView exercises={exercises} />;
}