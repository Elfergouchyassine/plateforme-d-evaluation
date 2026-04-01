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
  const role  = params.get("role");
  const email = params.get("email");
  if (role) {
    localStorage.setItem("userRole", role);
    localStorage.setItem("isLoggedIn", "true");
    if (email) localStorage.setItem("userEmail", decodeURIComponent(email));
    window.history.replaceState({}, "", "/");
  }
  return {
    role:      localStorage.getItem("userRole"),
    email:     localStorage.getItem("userEmail") || "",
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

function TestResultsPanel({ results }) {
  if (!results) return null;
  const { tests = [], passed, total, failed, error } = results;

  if (error && tests.length === 0) {
    return (
      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 16, marginTop: 12 }}>
        <strong style={{ color: "#dc2626" }}>Erreur d'exécution des tests :</strong>
        <pre style={{ marginTop: 8, fontSize: 12, overflow: "auto", whiteSpace: "pre-wrap", color: "#dc2626" }}>{error}</pre>
      </div>
    );
  }

  const allPassed = total > 0 && passed === total;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
        background: allPassed ? "#f0fdf4" : "#fef2f2",
        border: `1px solid ${allPassed ? "#bbf7d0" : "#fecaca"}`,
        borderRadius: 10, marginBottom: 10
      }}>
        <span style={{ fontSize: 24 }}>{allPassed ? "🎉" : "⚠️"}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: allPassed ? "#166534" : "#dc2626" }}>
            {passed}/{total} tests passés
          </div>
          {!allPassed && failed > 0 && (
            <div style={{ fontSize: 12, color: "#6b7280" }}>{failed} test(s) échoué(s)</div>
          )}
        </div>
      </div>

      {tests.map((t, i) => (
        <div key={i} style={{
          background: "#fff",
          border: `1px solid ${t.passed ? "#bbf7d0" : "#fecaca"}`,
          borderLeft: `4px solid ${t.passed ? "#22c55e" : "#ef4444"}`,
          borderRadius: 8, padding: "10px 14px", marginBottom: 8
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>{t.passed ? "✅" : "❌"}</span>
            <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{t.name}</span>
            {t.duration != null && (
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{t.duration}ms</span>
            )}
          </div>
          {!t.passed && t.error && (
            <pre style={{
              marginTop: 8, padding: 8, background: "#fef2f2", borderRadius: 6,
              fontSize: 11, color: "#dc2626", overflow: "auto", whiteSpace: "pre-wrap"
            }}>{t.error}</pre>
          )}
        </div>
      ))}
    </div>
  );
}

function GradePanel({ grade }) {
  if (!grade) return null;
  const { noteTests, noteSonar, noteFinale, ratingLetter, hasTests } = grade;
  const color = noteFinale >= 16 ? "#166534" : noteFinale >= 12 ? "#854d0e" : "#dc2626";
  const bg    = noteFinale >= 16 ? "#f0fdf4"  : noteFinale >= 12 ? "#fefce8"  : "#fef2f2";
  const border= noteFinale >= 16 ? "#bbf7d0"  : noteFinale >= 12 ? "#fde68a"  : "#fecaca";
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "16px 20px", marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 28 }}>🎓</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, color }}>
              {noteFinale} <span style={{ fontSize: 14, fontWeight: 500, color: "#6b7280" }}>/ 20</span>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Note finale</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {hasTests && noteTests !== null && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 18, color }}>{noteTests}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Tests /10</div>
            </div>
          )}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 18, color }}>{noteSonar}</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Qualité /10</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontWeight: 800, fontSize: 18,
              background: ratingLetter === "A" ? "#dcfce7" : ratingLetter === "B" ? "#dbeafe" : ratingLetter === "C" ? "#fef9c3" : "#fee2e2",
              color: ratingLetter === "A" ? "#166534" : ratingLetter === "B" ? "#1d4ed8" : ratingLetter === "C" ? "#854d0e" : "#dc2626",
              borderRadius: 6, padding: "2px 10px"
            }}>{ratingLetter}</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Sonar</div>
          </div>
        </div>
      </div>
      {!hasTests && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
          Aucun test défini pour cet exercice — note qualité × 2
        </div>
      )}
    </div>
  );
}

function StudentView({ exercises, studentEmail = "", isPreview = false, onBack }) {
  const [value, setValue] = useState(`// Écrivez votre code ici\nconsole.log("Hello!");`);
  const [lang, setLang] = useState("javascript");
  const [output, setOutput] = useState("");
  const [execLoading, setExecLoading] = useState(false);
  const [eduContent, setEduContent] = useState([]);
  const [sonarResults, setSonarResults] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [grade, setGrade] = useState(null);
  const [activeReportTab, setActiveReportTab] = useState("report");

  const anyLoading = execLoading || testLoading || loading;

  useEffect(() => {
    if (exercises.length > 0) {
      setSelectedExercise(exercises[0]);
      if (exercises[0]?.language) setLang(exercises[0].language);
    }
  }, [exercises]);

  const languageExtension = lang === "python" ? [python()] : [javascript({ jsx: true })];

  function handleExerciseChange(e) {
    const ex = exercises.find(ex => ex._id === e.target.value);
    setSelectedExercise(ex);
    setTestResults(null);
    setSonarResults(null);
    setOutput("");
    setGrade(null);
    if (ex?.language) setLang(ex.language);
  }

  async function handleExecute() {
    setExecLoading(true);
    setOutput("Exécution en cours...");
    try {
      const res = await fetch(`${API_URL}/api/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentCode: value, language: lang }),
      });
      const data = await res.json();
      setOutput(data.stdout || data.stderr || "Pas de sortie");
    } catch {
      setOutput("Erreur : backend non joignable");
    } finally {
      setExecLoading(false);
    }
  }

  async function handleRunTests() {
    if (!selectedExercise) return;
    setTestLoading(true);
    setTestResults(null);
    try {
      const res = await fetch(`${API_URL}/api/run-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseId: selectedExercise._id, studentCode: value, language: lang }),
      });
      setTestResults(await res.json());
    } catch (err) {
      setTestResults({ success: false, error: err.message, tests: [], passed: 0, total: 0, failed: 0 });
    } finally {
      setTestLoading(false);
    }
  }

  async function handleSubmit() {
    setLoading(true);
    setOutput("Soumission en cours...");
    setSonarResults(null);
    setGrade(null);
    try {
      const res = await fetch(`${API_URL}/api/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentCode: value,
          language: lang,
          exerciseId: selectedExercise?._id,
          studentEmail,
        }),
      });
      const result = await res.json();
      if (result.execution) setOutput(result.execution.stdout || result.execution.stderr || "Pas de sortie");
      if (result.sonar?.success) {
        setSonarResults(result.sonar);
        setEduContent(mapDiagnosticsToContent(parseSonarQubeReport(result.sonar)));
      }
      if (result.tests) setTestResults(result.tests);
      if (result.grade) setGrade(result.grade);
    } catch {
      setOutput("Erreur lors de la soumission");
    } finally {
      setLoading(false);
    }
  }

  const hasTests = Boolean(selectedExercise?.testCode);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>{isPreview ? "Aperçu : Mode Étudiant" : "Plateforme d'évaluation"}</h1>
        <div className="controls">
          {isPreview && (
            <button onClick={onBack} style={{ marginRight: 10, background: "#6b7280", color: "white", border: "none", padding: "8px 14px", borderRadius: 6, cursor: "pointer" }}>⬅ Retour</button>
          )}
          <select value={lang} onChange={e => setLang(e.target.value)}>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
          </select>
          <button onClick={handleExecute} disabled={anyLoading}
            style={{ background: "#6366f1", color: "white", border: "none", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
            {execLoading ? "⏳..." : "▶ Exécuter"}
          </button>
          {hasTests && (
            <button onClick={handleRunTests} disabled={anyLoading}
              style={{ background: "#10b981", color: "white", border: "none", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
              {testLoading ? "⏳ Tests..." : "🧪 Tester"}
            </button>
          )}
          <button className="btn-execute" onClick={handleSubmit} disabled={anyLoading}>
            {loading ? "⏳ Soumission..." : "📤 Soumettre"}
          </button>
          {!isPreview && <button className="btn-logout" onClick={logout}>🚪 Déconnexion</button>}
        </div>
      </header>

      <main className="main-container">
        <div className="left-section">
          {exercises.length > 0 && (
            <div className="exercise-selector">
              <label>Choisir un exercice :
                <select onChange={handleExerciseChange}>
                  {exercises.map(ex => <option key={ex._id} value={ex._id}>{ex.title}</option>)}
                </select>
              </label>
            </div>
          )}
          <div className="editor-section">
            <CodeMirror value={value} height="400px" theme={vscodeDark} extensions={languageExtension} onChange={val => setValue(val)} />
          </div>
        </div>

        <div className="right-section">
          <div className="exercise-section">
            {selectedExercise ? (
              <>
                <h2>{selectedExercise.title}</h2>
                <p>{selectedExercise.description}</p>
                <small>Difficulté: {selectedExercise.difficulty} | Langage: {selectedExercise.language} | Prof: {selectedExercise.teacherName}</small>
              </>
            ) : <p>Aucun exercice chargé.</p>}
          </div>

          {grade && <GradePanel grade={grade} />}
          {testResults && <TestResultsPanel results={testResults} />}

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
                    borderRadius: "8px 8px 0 0", fontWeight: 600, fontSize: 12,
                  }}>{t.label}</button>
                ))}
              </div>
              {activeReportTab === "report" && sonarResults.projectKey && (
                <SonarReportPanel projectKey={sonarResults.projectKey} />
              )}
              {activeReportTab === "edu" && (
                <div style={{ padding: 16, background: "#fff", border: "1px solid #e2e8f0", borderRadius: "0 8px 8px 8px" }}>
                  {eduContent.length === 0
                    ? <p style={{ color: "#64748b", fontSize: 13 }}>Aucun contenu pédagogique disponible.</p>
                    : eduContent.map((item, i) => (
                        <div key={i} style={{ marginBottom: 12, padding: 14, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                          <strong style={{ color: "#1e293b" }}>{item.title || item.key}</strong>
                          <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{item.description || item.explanation}</p>
                        </div>
                      ))
                  }
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const JS_TEST_PLACEHOLDER = `const { solution } = require('./solution');

test('example: solution(2, 3) returns 5', () => {
  expect(solution(2, 3)).toBe(5);
});`;

const PY_TEST_PLACEHOLDER = `from solution import solution

def test_example():
    assert solution(2, 3) == 5`;

function TeacherView({ exercises, fetchExercises }) {
  const [viewMode, setViewMode] = useState("manage");
  const [form, setForm] = useState({ title: "", description: "", language: "javascript", difficulty: "Moyen", classCode: "public", teacherName: "", testCode: "" });
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    const method = editId ? "PUT" : "POST";
    const url = editId ? `${API_URL}/api/exercises/${editId}` : `${API_URL}/api/exercises`;
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setMsg("✅ Succès !");
    setEditId(null);
    setForm({ title: "", description: "", language: "javascript", difficulty: "Moyen", classCode: "public", teacherName: "", testCode: "" });
    fetchExercises();
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer ?")) return;
    await fetch(`${API_URL}/api/exercises/${id}`, { method: "DELETE" });
    fetchExercises();
  }

  if (viewMode === "preview") return <StudentView exercises={exercises} isPreview={true} onBack={() => setViewMode("manage")} />;

  const testPlaceholder = form.language === "python" ? PY_TEST_PLACEHOLDER : JS_TEST_PLACEHOLDER;
  const testExtension = form.language === "python" ? [python()] : [javascript({ jsx: true })];

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
            
            {/* AJOUT : Langage */}
            <select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })} required>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
            </select>

            {/* AJOUT : Difficulté */}
            <select value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })} required>
              <option value="Facile">Facile</option>
              <option value="Moyen">Moyen</option>
              <option value="Difficile">Difficile</option>
            </select>

            <textarea placeholder="Description *" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} required />
            <input placeholder="Votre nom *" value={form.teacherName} onChange={e => setForm({ ...form, teacherName: e.target.value })} required />
            <select value={form.language} onChange={e => setForm({ ...form, language: e.target.value, testCode: "" })}>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
            </select>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6, display: "block" }}>
                Tests unitaires ({form.language === "python" ? "pytest" : "Jest"})
                <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>— optionnel</span>
              </label>
              <div style={{ border: "1px solid #d1d5db", borderRadius: 6, overflow: "hidden" }}>
                <CodeMirror
                  value={form.testCode}
                  height="180px"
                  theme={vscodeDark}
                  extensions={testExtension}
                  placeholder={testPlaceholder}
                  onChange={(val) => setForm({ ...form, testCode: val })}
                />
              </div>
              <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                {form.language === "python"
                  ? "Le code étudiant est importé depuis solution.py — utilisez : from solution import ma_fonction"
                  : "Le code étudiant est importé depuis solution.js — utilisez : const { maFonction } = require('./solution')"}
              </p>
            </div>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>{ex.title}</strong>
                  <span style={{ marginLeft: 8, fontSize: 11, color: "#6b7280" }}>{ex.language}</span>
                  {ex.testCode && <span style={{ marginLeft: 8, fontSize: 11, background: "#dcfce7", color: "#166534", padding: "1px 6px", borderRadius: 4 }}>🧪 Tests</span>}
                </div>
                <div>
                  <button onClick={() => { setEditId(ex._id); setForm({ ...ex, testCode: ex.testCode || "" }); }} style={{ background: "orange", border: "none", color: "white", marginRight: "5px", padding: "4px 8px", borderRadius: 4, cursor: "pointer" }}>✏️</button>
                  <button onClick={() => handleDelete(ex._id)} style={{ background: "red", border: "none", color: "white", padding: "4px 8px", borderRadius: 4, cursor: "pointer" }}>🗑️</button>
                </div>
              </div>
            </div>
          ))}

          <SubmissionsTable />
        </div>
      </main>
    </div>
  );
}

function SubmissionsTable() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/api/submissions`)
      .then(r => r.json())
      .then(data => setSubmissions(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const gradeColor = (note) => note >= 16 ? "#166534" : note >= 12 ? "#854d0e" : "#dc2626";
  const gradeBg    = (note) => note >= 16 ? "#f0fdf4"  : note >= 12 ? "#fefce8"  : "#fef2f2";

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>📊 Notes des étudiants ({submissions.length})</h2>
        <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 13 }}>
          {open ? "Réduire ▲" : "Afficher ▼"}
        </button>
      </div>

      {open && (
        loading ? (
          <div style={{ color: "#64748b", fontSize: 13 }}>Chargement...</div>
        ) : submissions.length === 0 ? (
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20, color: "#64748b", fontSize: 13, textAlign: "center" }}>
            Aucune soumission pour l'instant.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#1e293b", color: "#f8fafc" }}>
                  {["Étudiant", "Exercice", "Langage", "Tests", "Sonar", "Note /20", "Date"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {submissions.map((s, i) => (
                  <tr key={s._id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "10px 14px", color: "#1e293b" }}>{s.studentEmail}</td>
                    <td style={{ padding: "10px 14px" }}>{s.exerciseTitle || "—"}</td>
                    <td style={{ padding: "10px 14px", color: "#6b7280" }}>{s.language}</td>
                    <td style={{ padding: "10px 14px" }}>
                      {s.noteTests !== null && s.noteTests !== undefined
                        ? <span style={{ fontWeight: 600 }}>{s.noteTests}/10 <span style={{ fontSize: 11, color: "#6b7280" }}>({s.testsPassés}/{s.testsTotal})</span></span>
                        : <span style={{ color: "#9ca3af" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{
                        fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                        background: s.sonarRating === "A" ? "#dcfce7" : s.sonarRating === "B" ? "#dbeafe" : s.sonarRating === "C" ? "#fef9c3" : "#fee2e2",
                        color: s.sonarRating === "A" ? "#166534" : s.sonarRating === "B" ? "#1d4ed8" : s.sonarRating === "C" ? "#854d0e" : "#dc2626"
                      }}>{s.sonarRating || "—"}</span>
                      <span style={{ marginLeft: 6, fontSize: 11, color: "#6b7280" }}>{s.noteSonar}/10</span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontWeight: 800, fontSize: 15, color: gradeColor(s.noteFinale), background: gradeBg(s.noteFinale), padding: "3px 10px", borderRadius: 6 }}>
                        {s.noteFinale}/20
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", color: "#6b7280", fontSize: 11 }}>
                      {new Date(s.submittedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
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
    : <StudentView exercises={exercises} studentEmail={authState.email} />;
}
