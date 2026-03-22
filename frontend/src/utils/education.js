import lintContent from "../content/lintContent.json";


export function parseSonarQubeReport(sonarResult) {
  if (!sonarResult || !sonarResult.issues) return [];

  const diagnostics = [];

  sonarResult.issues.forEach(issue => {
    // Mapper les issues SonarQube vers les clés pédagogiques
    let key = null;

    if (issue.type === "BUG") {
      // Détecter le type de bug spécifique
      if (issue.message.includes("Unexpected")) {
        key = "syntax_error";
      } else if (issue.message.includes("undefined")) {
        key = "undefined_variable";
      }
    } else if (issue.type === "VULNERABILITY") {
      key = "security_issue";
    } else if (issue.type === "CODE_SMELL") {
      key = "code_quality";
    }

    if (key) {
      diagnostics.push({
        key,
        message: issue.message,
        severity: issue.severity,
        line: issue.line
      });
    }
  });

  return diagnostics;
}

/**
 * mapDiagnosticsToContent(diagnostics) => array de contenus
 */
export function mapDiagnosticsToContent(diagnostics) {
  if (!Array.isArray(diagnostics)) return [];
  const contents = [];
  const seen = new Set();

  diagnostics.forEach((d) => {
    if (seen.has(d.key)) return;
    seen.add(d.key);

    const entry = lintContent[d.key];
    if (entry) {
      contents.push({
        key: d.key,
        severity: d.severity,
        line: d.line,
        ...entry
      });
    }
  });

  return contents;
}