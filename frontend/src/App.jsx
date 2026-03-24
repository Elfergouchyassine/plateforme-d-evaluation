import React, { useEffect, useState, useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import "./App.css";
import { parseSonarQubeReport, mapDiagnosticsToContent } from "./utils/education";

const API_URL = "http://localhost:5000";

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

function SeverityBadge({ severity }) {
  const map = {
    BLOCKER:  { color: "#7c3aed", bg: "#ede9fe", label: "Bloquant" },
    CRITICAL: { color: "#dc2626", bg: "#fee2e2", label: "Critique" },
    MAJOR:    { color: "#ea580c", bg: "#ffedd5", label: "Majeur" },
    MINOR:    { color: "#ca8a04", bg: "#fef9c3", label: "Mineur" },
    INFO:     { color: "#0284c7", bg: "#e0f2fe", label: "Info" },
  };
  const s = map[severity] || { color: "#6b7280", bg: "#f3f4f6", label: severity };
  return (
    <span style={{
      background: s.bg, color: s.color, fontWeight: 700,
      fontSize: 11, padding: "2px 8px", borderRadius: 4, letterSpacing: ".5px"
    }}>{s.label.toUpperCase()}</span>
  );
}

function TypeBadge({ type }) {
  const map = {
    BUG:           { icon: "🐛", label: "Bug",           color: "#dc2626" },
    VULNERABILITY: { icon: "🔒", label: "Vulnérabilité", color: "#7c3aed" },
    CODE_SMELL:    { icon: "🧹", label: "Code Smell",    color: "#ea580c" },
  };
  const t = map[type] || { icon: "⚠️", label: type, color: "#6b7280" };
  return (
    <span style={{ color: t.color, fontWeight: 600, fontSize: 12 }}>
      {t.icon} {t.label}
    </span>
  );
}

function WherePanel({ issue, sourceLines }) {
  const issueLine = issue.line;
  const rangeStart = Math.max(1, (issueLine || 1) - 3);
  const rangeEnd = (issueLine || 1) + 3;
  const visibleLines = sourceLines.filter(l => l.line >= rangeStart && l.line <= rangeEnd);
  const filename = issue.component?.split(":").pop() || "code.js";

  return (
    <div>
      <div style={{ marginBottom: 10, fontSize: 13, color: "#64748b" }}>
        <span style={{ fontFamily: "monospace", background: "#f1f5f9", padding: "2px 8px", borderRadius: 4 }}>
          📄 {filename}
        </span>
        {issueLine && (
          <span style={{ marginLeft: 8, color: "#2563eb", fontWeight: 600 }}>Ligne {issueLine}</span>
        )}
      </div>
      {visibleLines.length > 0 ? (
        <div style={{ background: "#0f172a", borderRadius: 8, overflow: "hidden", fontFamily: "monospace", fontSize: 13, lineHeight: 1.6 }}>
          {visibleLines.map(l => {
            const isIssue = l.line === issueLine;
            return (
              <div key={l.line} style={{
                display: "flex",
                background: isIssue ? "rgba(234,88,12,.15)" : "transparent",
                borderLeft: isIssue ? "3px solid #ea580c" : "3px solid transparent",
              }}>
                <span style={{
                  minWidth: 44, textAlign: "right", padding: "0 10px",
                  color: isIssue ? "#ea580c" : "#475569",
                  fontWeight: isIssue ? 700 : 400, userSelect: "none", flexShrink: 0
                }}>{l.line}</span>
                <span
                  style={{ color: "#e2e8f0", padding: "0 12px", whiteSpace: "pre", flex: 1, overflow: "auto" }}
                  dangerouslySetInnerHTML={{ __html: l.code || "" }}
                />
                {isIssue && <span style={{ color: "#ea580c", padding: "0 10px", fontSize: 11, alignSelf: "center" }}>⬅ ici</span>}
              </div>
            );
          })}
          <div style={{
            background: "rgba(234,88,12,.12)", borderLeft: "3px solid #ea580c",
            padding: "8px 14px", display: "flex", alignItems: "flex-start", gap: 8
          }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span style={{ color: "#fed7aa", fontSize: 13 }}>{issue.message}</span>
          </div>
        </div>
      ) : (
        <div style={{ background: "#0f172a", borderRadius: 8, padding: 16, fontFamily: "monospace", color: "#e2e8f0", fontSize: 13 }}>
          <div style={{ color: "#94a3b8", marginBottom: 8 }}>Ligne {issueLine} — {filename}</div>
          <div style={{ background: "rgba(234,88,12,.15)", borderLeft: "3px solid #ea580c", padding: "8px 12px", color: "#fed7aa" }}>
            ⚠️ {issue.message}
          </div>
        </div>
      )}
    </div>
  );
}

function WhyPanel({ issue }) {
  return (
    <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.7 }}>
      {issue.ruleName && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontWeight: 600, color: "#1e293b", fontSize: 14, display: "block", marginBottom: 4 }}>
            Règle : <code style={{ background: "#f1f5f9", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace", fontSize: 12 }}>{issue.rule}</code>
          </span>
          <span style={{ color: "#64748b" }}>{issue.ruleName}</span>
        </div>
      )}
      {issue.ruleDesc ? (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, marginTop: 8 }}>
          <div style={{ color: "#374151" }} dangerouslySetInnerHTML={{ __html: issue.ruleDesc }} />
        </div>
      ) : (
        <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: 16, color: "#854d0e" }}>
          <strong>Pourquoi c'est un problème ?</strong>
          <p style={{ marginTop: 6, marginBottom: 0 }}>
            {issue.type === "CODE_SMELL" && "Ce code fonctionne, mais il est difficile à maintenir ou comprendre. Les 'code smells' sont des indicateurs de mauvaise conception qui peuvent mener à des bugs futurs."}
            {issue.type === "BUG" && "Ce code contient un comportement incorrect qui peut provoquer des erreurs à l'exécution ou des résultats inattendus."}
            {issue.type === "VULNERABILITY" && "Ce code expose une faille de sécurité qui pourrait être exploitée par des personnes malveillantes."}
          </p>
        </div>
      )}
      <div style={{ marginTop: 14, padding: "10px 14px", background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe" }}>
        <strong style={{ color: "#1d4ed8" }}>💡 Comment corriger ?</strong>
        <ul style={{ margin: "6px 0 0 0", paddingLeft: 18, color: "#1e40af" }}>
          {issue.type === "CODE_SMELL" && (<>
            <li>Simplifiez la condition redondante</li>
            <li>Évitez les expressions toujours vraies ou toujours fausses</li>
            <li>Assurez-vous que la logique reflète l'intention du code</li>
          </>)}
          {issue.type === "BUG" && (<>
            <li>Vérifiez la logique de la condition</li>
            <li>Testez avec différentes valeurs</li>
            <li>Consultez la documentation de la règle {issue.rule}</li>
          </>)}
          {issue.type === "VULNERABILITY" && (<>
            <li>Validez et nettoyez toutes les entrées utilisateur</li>
            <li>Utilisez des bibliothèques de sécurité reconnues</li>
            <li>Appliquez le principe du moindre privilège</li>
          </>)}
        </ul>
      </div>
    </div>
  );
}

function IssueDetailPanel({ issue, sourceLines, onClose }) {
  const [activeTab, setActiveTab] = useState("where");
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", marginBottom: 12, boxShadow: "0 4px 20px rgba(0,0,0,.08)" }}>
      <div style={{ background: "#1e293b", color: "#f8fafc", padding: "14px 18px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            <TypeBadge type={issue.type} />
            <SeverityBadge severity={issue.severity} />
            {issue.effort && <span style={{ color: "#94a3b8", fontSize: 12 }}>⏱ {issue.effort}</span>}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{issue.message}</div>
          {issue.tags?.length > 0 && (
            <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {issue.tags.map(t => (
                <span key={t} style={{ background: "#334155", color: "#94a3b8", fontSize: 10, padding: "2px 6px", borderRadius: 3 }}>{t}</span>
              ))}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}>✕</button>
      </div>
      <div style={{ display: "flex", borderBottom: "2px solid #f1f5f9", background: "#f8fafc" }}>
        {[{ id: "where", label: "📍 Où est le problème ?" }, { id: "why", label: "💡 Pourquoi c'est un problème ?" }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: "10px 20px", border: "none", background: "none", cursor: "pointer",
            fontWeight: activeTab === tab.id ? 700 : 400,
            color: activeTab === tab.id ? "#2563eb" : "#64748b",
            borderBottom: activeTab === tab.id ? "2px solid #2563eb" : "2px solid transparent",
            fontSize: 13, marginBottom: -2, transition: "all .15s"
          }}>{tab.label}</button>
        ))}
      </div>
      <div style={{ padding: 18 }}>
        {activeTab === "where" ? <WherePanel issue={issue} sourceLines={sourceLines} /> : <WhyPanel issue={issue} />}
      </div>
    </div>
  );
}

function SonarReportPanel({ projectKey }) {
  const [issues, setIssues] = useState([]);
  const [sourceLines, setSourceLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedIssue, setExpandedIssue] = useState(null);

  const fetchReport = useCallback(async () => {
    if (!projectKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/sonar/issues/${projectKey}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setIssues(data.issues);
      if (data.issues.length > 0) {
        const component = data.issues[0].component;
        const srcRes = await fetch(`${API_URL}/api/sonar/source/${projectKey}?component=${encodeURIComponent(component)}`);
        const srcData = await srcRes.json();
        setSourceLines(srcData.sources || []);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  useEffect(() => { if (projectKey) fetchReport(); }, [projectKey, fetchReport]);

  if (!projectKey) return null;

  const stats = {
    bugs: issues.filter(i => i.type === "BUG").length,
    vulnerabilities: issues.filter(i => i.type === "VULNERABILITY").length,
    codeSmells: issues.filter(i => i.type === "CODE_SMELL").length,
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14, padding: "12px 16px",
        background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
        borderRadius: 10, color: "#f8fafc"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🔍</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Rapport d'analyse de code</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Qualité & problèmes détectés</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { label: "Bugs", count: stats.bugs, color: "#fca5a5" },
            { label: "Vulnérabilités", count: stats.vulnerabilities, color: "#c4b5fd" },
            { label: "Code Smells", count: stats.codeSmells, color: "#fdba74" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 30, color: "#64748b", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
          Récupération du rapport en cours…
        </div>
      )}

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 16, color: "#dc2626", fontSize: 13 }}>
          ❌ Erreur lors de la récupération du rapport : {error}
        </div>
      )}

      {!loading && !error && issues.length === 0 && (
        <div style={{ textAlign: "center", padding: 30, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, color: "#166534" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <strong>Aucun problème détecté !</strong>
          <p style={{ marginTop: 4, fontSize: 13 }}>Votre code passe les vérifications de qualité.</p>
        </div>
      )}

      {!loading && issues.length > 0 && (
        <div>
          {issues.map(issue => {
            const isExpanded = expandedIssue === issue.key;
            return isExpanded ? (
              <IssueDetailPanel key={issue.key} issue={issue} sourceLines={sourceLines} onClose={() => setExpandedIssue(null)} />
            ) : (
              <button
                key={issue.key}
                onClick={() => setExpandedIssue(issue.key)}
                style={{
                  width: "100%", textAlign: "left", background: "#fff",
                  border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 16px",
                  marginBottom: 8, cursor: "pointer", display: "flex",
                  alignItems: "center", gap: 10, transition: "all .15s",
                  boxShadow: "0 1px 4px rgba(0,0,0,.05)"
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#2563eb"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(37,99,235,.12)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,.05)"; }}
              >
                <TypeBadge type={issue.type} />
                <span style={{ flex: 1, fontSize: 13, color: "#1e293b" }}>{issue.message}</span>
                <SeverityBadge severity={issue.severity} />
                {issue.line && (
                  <span style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", background: "#f1f5f9", padding: "2px 6px", borderRadius: 3 }}>L{issue.line}</span>
                )}
                <span style={{ color: "#94a3b8", fontSize: 16 }}>›</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StudentView({ exercises, isPreview = false, onBack }) {
  const [value, setValue] = useState(`// Écrivez votre code ici\nconsole.log("Hello!");`);
  const [lang, setLang] = useState("javascript");
  const [output, setOutput] = useState("");
  const [eduContent, setEduContent] = useState([]);
  const [sonarResults, setSonarResults] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeReportTab, setActiveReportTab] = useState("report");

  useEffect(() => {
    if (exercises.length > 0) setSelectedExercise(exercises[0]);
  }, [exercises]);

  const languageExtension = lang === "python" ? [python()] : [javascript({ jsx: true })];

  async function sendToJudge0() {
    setLoading(true);
    setOutput("Exécution en cours...");
    setSonarResults(null);
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
          {isPreview && (
            <button className="btn-back" onClick={onBack} style={{ marginRight: "10px", background: "#6b7280" }}>⬅ Retour Gestion</button>
          )}
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
          </select>
          <button className="btn-execute" onClick={sendToJudge0} disabled={loading}>
            {loading ? "⏳ Analyse..." : "▶ Exécuter & Analyser"}
          </button>
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

          {sonarResults && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
                {[{ id: "report", label: "🔍 Rapport Qualité" }, { id: "edu", label: "📚 Contenu Pédagogique" }].map(t => (
                  <button key={t.id} onClick={() => setActiveReportTab(t.id)} style={{
                    padding: "8px 16px", border: "none", cursor: "pointer",
                    background: activeReportTab === t.id ? "#1e293b" : "#f1f5f9",
                    color: activeReportTab === t.id ? "#f8fafc" : "#64748b",
                    borderRadius: "8px 8px 0 0", fontWeight: 600, fontSize: 12, transition: "all .15s"
                  }}>{t.label}</button>
                ))}
              </div>

              {activeReportTab === "report" && sonarResults.projectKey && (
                <SonarReportPanel projectKey={sonarResults.projectKey} />
              )}

              {activeReportTab === "edu" && (
                <div style={{ padding: 16, background: "#fff", border: "1px solid #e2e8f0", borderRadius: "0 8px 8px 8px" }}>
                  {eduContent.length === 0 ? (
                    <p style={{ color: "#64748b", fontSize: 13 }}>Aucun contenu pédagogique disponible pour ces résultats.</p>
                  ) : (
                    eduContent.map((item, i) => (
                      <div key={i} style={{ marginBottom: 12, padding: 14, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                        <strong style={{ color: "#1e293b" }}>{item.title || item.key}</strong>
                        <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{item.description || item.explanation}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function TeacherView({ exercises, fetchExercises }) {
  const [viewMode, setViewMode] = useState("manage");
  const [form, setForm] = useState({ title: "", description: "", language: "javascript", difficulty: "Moyen", classCode: "public", teacherName: "" });
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    const method = editId ? "PUT" : "POST";
    const url = editId ? `${API_URL}/api/exercises/${editId}` : `${API_URL}/api/exercises`;
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
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

  if (viewMode === "preview") return <StudentView exercises={exercises} isPreview={true} onBack={() => setViewMode("manage")} />;

  return (
    <div className="teacher-container">
      <header className="app-header">
        <h1>Interface Enseignant</h1>
        <div className="controls">
          <button onClick={() => setViewMode("preview")} style={{ background: "#10b981", color: "white", border: "none", padding: "10px", borderRadius: "5px", cursor: "pointer", marginRight: "10px" }}>
            👁️ Aperçu Étudiant
          </button>
          <button className="btn-logout" onClick={logout}>🚪 Déconnexion</button>
        </div>
      </header>
      <main style={{ display: "flex", gap: 24, padding: 24 }}>
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
          {msg && <p style={{ color: "green", marginTop: 8 }}>{msg}</p>}
        </div>
        <div style={{ flex: 2 }}>
          <h2>📋 Mes Exercices ({exercises.length})</h2>
          {exercises.map(ex => (
            <div key={ex._id} style={{ background: "#fff", padding: 16, marginBottom: 12, borderRadius: 8, boxShadow: "0 2px 6px rgba(0,0,0,.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{ex.title}</strong>
                <div>
                  <button onClick={() => { setEditId(ex._id); setForm(ex); }} style={{ background: "orange", border: "none", color: "white", marginRight: "5px" }}>✏️</button>
                  <button onClick={() => handleDelete(ex._id)} style={{ background: "red", border: "none", color: "white" }}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [authState, setAuthState] = useState(null);
  const [exercises, setExercises] = useState([]);

  useEffect(() => {
    const auth = getAuthFromURL();
    if (!auth.isLoggedIn) { window.location.href = "http://localhost:3000"; return; }
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
