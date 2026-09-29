import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

type TestResults = {
  output: string;
  error: string;
  returncode: number;
  passed: number;
  failed: number;
  errors: number;
  execution_time: number;
};

type TaskTab = "code" | "tests" | "debugger" | "srs" | "analysis" | "git";

type ProjectReport = {
  tests_passed: number;
  tests_total: number;
  coverage_percent: number;
  security_warnings: number;
  quality_issues: number;
  requirements_covered: number;
  requirements_total: number;
  documentation_generated: boolean;
  summary: string;
};

type GitStatus = {
  is_repo: boolean;
  branch: string;
  modified: string[];
  untracked: string[];
  staged: string[];
  commits_count: number;
  message?: string;
};

type GitCommitItem = {
  hash: string;
  message: string;
  author: string;
  time: string;
};

function App() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const [code, setCode] = useState("");

  const [uploading, setUploading] = useState(false);
  const [filename, setFilename] = useState("");

  const [instruction, setInstruction] = useState("");
  const [generating, setGenerating] = useState(false);

  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const [projectMessage, setProjectMessage] = useState("");
  const [projectLoading, setProjectLoading] = useState(false);

  const [generatedTests, setGeneratedTests] = useState("");
  const [testInstruction, setTestInstruction] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testMessage, setTestMessage] = useState("");

  const [testResults, setTestResults] = useState<TestResults | null>(null);
  const [testRunLoading, setTestRunLoading] = useState(false);

  const [requirements, setRequirements] = useState("");
  const [traceability, setTraceability] = useState("");
  const [traceabilityLoading, setTraceabilityLoading] = useState(false);
  const [traceabilityMessage, setTraceabilityMessage] = useState("");

  const [debugResult, setDebugResult] = useState("");
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugMessage, setDebugMessage] = useState("");

  const [analysisResult, setAnalysisResult] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState("");

  const [documentation, setDocumentation] = useState("");
  const [documentationLoading, setDocumentationLoading] = useState(false);
  const [documentationMessage, setDocumentationMessage] = useState("");

  const [activeTab, setActiveTab] = useState<TaskTab>("code");

  // Full Analysis & Project Report
  const [projectReport, setProjectReport] = useState<ProjectReport | null>(null);
  const [fullAnalysisLoading, setFullAnalysisLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showArchModal, setShowArchModal] = useState(false);

  // Git State
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitCommits, setGitCommits] = useState<GitCommitItem[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [gitLoading, setGitLoading] = useState(false);
  const [gitFeedback, setGitFeedback] = useState("");

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    (window as any).__setCode = (newCode: string) => setCode(newCode);
    (window as any).__getCode = () => code;
  }, [code]);

  useEffect(() => {
    if (projectName) {
      fetchGitStatus(projectName);
      fetchGitLog(projectName);
    }
  }, [projectName]);

  async function uploadSRS(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_URL}/upload-srs`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Upload failed");
      }

      setFilename(data.filename);
      alert("SRS uploaded and indexed locally in ChromaDB!");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to upload SRS.");
    } finally {
      setUploading(false);
    }
  }

  async function askQuestion() {
    if (!question.trim()) return;

    setLoading(true);
    setAnswer("");

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Question failed");
      }

      setAnswer(data.answer);
    } catch (error) {
      setAnswer("Error: Could not connect to local backend (ensure server is running).");
    } finally {
      setLoading(false);
    }
  }

  async function generateCode() {
    if (!instruction.trim()) return;

    setGenerating(true);

    try {
      const response = await fetch(`${API_URL}/generate-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, code }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || "Code generation failed");
      }

      setCode(data.code);
      setOutput("");
      setTestResults(null);
      setDebugResult("");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to generate code.");
    } finally {
      setGenerating(false);
    }
  }

  async function runCode() {
    if (!code.trim()) return;

    setRunning(true);
    setOutput("");
    setDebugResult("");
    setDebugMessage("");

    try {
      const response = await fetch(`${API_URL}/run-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Code execution failed");
      }

      if (data.error) {
        setOutput(data.error);
      } else {
        setOutput(data.output || "Program completed successfully.");
      }
    } catch (error) {
      setOutput(error instanceof Error ? error.message : "Failed to run code.");
    } finally {
      setRunning(false);
    }
  }

  function clearEditor() {
    setInstruction("");
    setCode("");
    setOutput("");
    setGeneratedTests("");
    setTestResults(null);
    setRequirements("");
    setTraceability("");
    setTraceabilityMessage("");
    setDebugResult("");
    setDebugMessage("");
    setTestMessage("");
    setAnalysisResult("");
    setDocumentation("");
    setProjectReport(null);
  }

  async function loadProjects() {
    try {
      const response = await fetch(`${API_URL}/projects`);
      if (!response.ok) return;
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.warn("Backend not yet connected for projects list:", error);
    }
  }

  async function saveProject() {
    if (!projectName.trim()) {
      setProjectMessage("Enter a project name.");
      return;
    }

    if (!code.trim()) {
      setProjectMessage("There is no code to save.");
      return;
    }

    setProjectLoading(true);
    setProjectMessage("");

    try {
      const response = await fetch(`${API_URL}/save-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_name: projectName,
          code,
          tests: generatedTests,
          requirements,
          traceability,
          analysis: analysisResult,
          documentation,
          srs_filename: filename,
          metadata: {
            last_saved: new Date().toISOString(),
            testResults: testResults,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || "Save failed");
      }

      setProjectName(data.project_name);
      setProjectMessage(`Project "${data.project_name}" and all engineering artifacts saved.`);
      await loadProjects();
      await fetchGitStatus(data.project_name);
    } catch (error) {
      setProjectMessage(error instanceof Error ? error.message : "Failed to save project.");
    } finally {
      setProjectLoading(false);
    }
  }

  async function openProject(name: string) {
    setProjectLoading(true);
    setProjectMessage("");

    try {
      const response = await fetch(
        `${API_URL}/projects/${encodeURIComponent(name)}`
      );

      const data = await response.json();
      if (!response.ok || data.code === undefined) {
        throw new Error(data.detail || data.message || "Project loading failed");
      }

      setProjectName(data.project_name);
      setCode(data.code || "");
      setGeneratedTests(data.tests || "");
      setRequirements(data.requirements || "");
      setTraceability(data.traceability || "");
      setAnalysisResult(data.analysis || "");
      setDocumentation(data.documentation || "");
      if (data.srs_filename) {
        setFilename(data.srs_filename);
      }
      if (data.metadata?.testResults) {
        setTestResults(data.metadata.testResults);
      }
      setOutput("");
      setInstruction("");
      setDebugResult("");

      setProjectMessage(`Project "${data.project_name}" loaded with complete engineering state.`);
      await fetchGitStatus(data.project_name);
      await fetchGitLog(data.project_name);
    } catch (error) {
      setProjectMessage(error instanceof Error ? error.message : "Failed to load project.");
    } finally {
      setProjectLoading(false);
    }
  }

  async function deleteProject(name: string) {
    const confirmed =
      typeof window !== "undefined" && (window as any).__FORCE_CONFIRM__
        ? true
        : window.confirm(`Delete project "${name}"?`);

    if (!confirmed) return;

    setProjectLoading(true);
    setProjectMessage("");

    try {
      const response = await fetch(
        `${API_URL}/projects/${encodeURIComponent(name)}`,
        { method: "DELETE" }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || "Project deletion failed");
      }

      setProjects((currentProjects) => currentProjects.filter((p) => p !== name));

      if (projectName === name) {
        setProjectName("");
        clearEditor();
      }

      setProjectMessage(`Project "${name}" deleted successfully.`);
    } catch (error) {
      setProjectMessage(error instanceof Error ? error.message : "Failed to delete project.");
    } finally {
      setProjectLoading(false);
    }
  }

  async function generateTests() {
    if (!code.trim()) {
      setTestMessage("Generate or enter source code first.");
      return;
    }

    setTestLoading(true);
    setTestMessage("");
    setTestResults(null);

    try {
      const response = await fetch(`${API_URL}/generate-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, instruction: testInstruction }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || "Test generation failed.");
      }

      if (!data.tests) {
        throw new Error("The backend returned no test code.");
      }

      setGeneratedTests(data.tests);
      setTestMessage("Test cases generated successfully.");
    } catch (error) {
      setTestMessage(error instanceof Error ? error.message : "Test generation failed.");
    } finally {
      setTestLoading(false);
    }
  }

  async function runTests() {
    if (!code.trim()) {
      setTestMessage("Enter source code before running tests.");
      return;
    }

    if (!generatedTests.trim()) {
      setTestMessage("Generate or enter tests before running them.");
      return;
    }

    setTestRunLoading(true);
    setTestMessage("");
    setTestResults(null);
    setDebugResult("");
    setDebugMessage("");

    try {
      const response = await fetch(`${API_URL}/run-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, tests: generatedTests }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || "Test execution failed.");
      }

      setTestResults({
        output: data.output || "",
        error: data.error || "",
        returncode: data.returncode ?? -1,
        passed: data.passed || 0,
        failed: data.failed || 0,
        errors: data.errors || 0,
        execution_time: data.execution_time || 0,
      });
    } catch (error) {
      setTestMessage(error instanceof Error ? error.message : "Unable to execute tests.");
    } finally {
      setTestRunLoading(false);
    }
  }

  async function generateTraceability() {
    if (!requirements.trim()) {
      setTraceabilityMessage("Please enter or upload software requirements first.");
      return;
    }

    setTraceabilityLoading(true);
    setTraceabilityMessage("");
    setTraceability("");

    try {
      const response = await fetch(`${API_URL}/generate-traceability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirements,
          code: code.trim() || "",
          tests: generatedTests.trim() || "",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const errorMsg =
          typeof data.detail === "string"
            ? data.detail
            : Array.isArray(data.detail)
            ? data.detail.map((e: any) => e.msg || JSON.stringify(e)).join(", ")
            : data.message || "Failed to generate traceability matrix.";
        throw new Error(errorMsg);
      }

      setTraceability(data.traceability || "");
      if (!code.trim() && !generatedTests.trim()) {
        setTraceabilityMessage("Traceability matrix generated from requirements. Implement code and tests to track verification.");
      } else if (!generatedTests.trim()) {
        setTraceabilityMessage("Traceability matrix mapped to code functions. Generate tests in Test Suite for full verification.");
      }
    } catch (error) {
      setTraceabilityMessage(error instanceof Error ? error.message : "Unable to generate matrix.");
    } finally {
      setTraceabilityLoading(false);
    }
  }

  async function debugCode() {
    let errorText = "";

    if (testResults?.error) {
      errorText = testResults.error;
    } else if (testResults && (testResults.failed > 0 || testResults.errors > 0)) {
      errorText = testResults.output;
    } else if (output.trim()) {
      errorText = output;
    }

    if (!errorText.trim()) {
      setDebugMessage("Run code or tests first so the debugger has an error trace to analyze.");
      return;
    }

    setDebugLoading(true);
    setDebugMessage("");
    setDebugResult("");

    try {
      const response = await fetch(`${API_URL}/debug-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, error: errorText }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || "Debugging failed.");
      }

      setDebugResult(data.debug || "");
    } catch (error) {
      setDebugMessage(error instanceof Error ? error.message : "Unable to analyze the error.");
    } finally {
      setDebugLoading(false);
    }
  }

  async function analyzeCode() {
    if (!code.trim()) {
      setAnalysisMessage("Enter source code before analyzing.");
      return;
    }

    setAnalysisLoading(true);
    setAnalysisMessage("");
    setAnalysisResult("");

    try {
      const response = await fetch(`${API_URL}/analyze-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || "Code analysis failed.");
      }

      setAnalysisResult(data.analysis || "");
    } catch (error) {
      setAnalysisMessage(error instanceof Error ? error.message : "Unable to analyze code.");
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function generateDocumentation() {
    if (!code.trim()) {
      setDocumentationMessage("Enter source code before generating documentation.");
      return;
    }

    setDocumentationLoading(true);
    setDocumentationMessage("");
    setDocumentation("");

    try {
      const response = await fetch(`${API_URL}/generate-documentation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || "Documentation generation failed.");
      }

      setDocumentation(data.documentation || "");
    } catch (error) {
      setDocumentationMessage(error instanceof Error ? error.message : "Unable to generate documentation.");
    } finally {
      setDocumentationLoading(false);
    }
  }

  async function runFullAnalysis() {
    if (!code.trim()) {
      alert("Enter or generate Python source code first.");
      return;
    }

    setFullAnalysisLoading(true);

    try {
      const response = await fetch(`${API_URL}/run-full-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          tests: generatedTests,
          requirements,
          instruction,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || "Full analysis failed");
      }

      if (data.report) {
        setProjectReport(data.report);
        setShowReportModal(true);
      }
      if (data.test_results) {
        setTestResults(data.test_results);
      }
      if (data.analysis) {
        setAnalysisResult(data.analysis);
      }
      if (data.traceability) {
        setTraceability(data.traceability);
      }
      if (data.documentation) {
        setDocumentation(data.documentation);
      }
      if (data.code_output?.output) {
        setOutput(data.code_output.output);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Full analysis failed.");
    } finally {
      setFullAnalysisLoading(false);
    }
  }

  // Git handlers
  async function fetchGitStatus(proj: string = projectName) {
    if (!proj) return;
    try {
      const resp = await fetch(
        `${API_URL}/git/status?project_name=${encodeURIComponent(proj)}`
      );
      if (resp.ok) {
        const data = await resp.json();
        setGitStatus(data);
      }
    } catch (e) {
      console.warn("Git status check error:", e);
    }
  }

  async function fetchGitLog(proj: string = projectName) {
    if (!proj) return;
    try {
      const resp = await fetch(
        `${API_URL}/git/log?project_name=${encodeURIComponent(proj)}`
      );
      if (resp.ok) {
        const data = await resp.json();
        setGitCommits(data.commits || []);
      }
    } catch (e) {
      console.warn("Git log check error:", e);
    }
  }

  async function initGit() {
    if (!projectName.trim()) {
      setGitFeedback("Save or name a project first to initialize Git.");
      return;
    }
    setGitLoading(true);
    setGitFeedback("");
    try {
      const resp = await fetch(`${API_URL}/git/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_name: projectName }),
      });
      const data = await resp.json();
      setGitFeedback(data.message || "Git initialized");
      await fetchGitStatus(projectName);
    } catch (e) {
      setGitFeedback("Failed to initialize git repository.");
    } finally {
      setGitLoading(false);
    }
  }

  async function commitGit() {
    if (!projectName.trim()) {
      setGitFeedback("Save or open a project first.");
      return;
    }
    if (!commitMessage.trim()) {
      setGitFeedback("Enter a commit message.");
      return;
    }
    setGitLoading(true);
    setGitFeedback("");
    try {
      const resp = await fetch(`${API_URL}/git/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_name: projectName,
          message: commitMessage,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.message || "Commit failed");
      }
      setGitFeedback(`Committed [${data.commit_hash}]: "${commitMessage}"`);
      setCommitMessage("");
      await fetchGitStatus(projectName);
      await fetchGitLog(projectName);
    } catch (e) {
      setGitFeedback(e instanceof Error ? e.message : "Commit failed.");
    } finally {
      setGitLoading(false);
    }
  }

  const detectedError =
    testResults?.error ||
    (testResults && (testResults.failed > 0 || testResults.errors > 0)
      ? testResults.output
      : "") ||
    (output &&
    (output.includes("Error") ||
      output.includes("Traceback") ||
      output.includes("Exception"))
      ? output
      : "");

  const requirementsCount = requirements
    .split("\n")
    .filter((l) => l.trim().startsWith("REQ-") || l.trim().length > 8).length;

  return (
    <div className="app-layout">
      {/* ================= TOP BAR ================= */}
      <header className="top-bar">
        <div className="top-bar-brand">
          <span className="brand-icon">⚡</span>
          <div>
            <span className="brand-title">Offline AI Workbench</span>
            <span className="brand-subtitle">Local Autonomous Development Suite</span>
          </div>
        </div>

        <nav className="task-nav" aria-label="Workbench Tasks">
          <button
            id="nav-tab-code"
            className={`task-tab ${activeTab === "code" ? "active" : ""}`}
            onClick={() => setActiveTab("code")}
          >
            💻 Code
          </button>

          <button
            id="nav-tab-tests"
            className={`task-tab ${activeTab === "tests" ? "active" : ""}`}
            onClick={() => setActiveTab("tests")}
          >
            🧪 Tests
            {testResults && (
              <span
                className={`tab-tag ${
                  testResults.failed > 0 || testResults.errors > 0
                    ? "tag-warn"
                    : "tag-success"
                }`}
              >
                {testResults.passed}P {testResults.failed > 0 ? `${testResults.failed}F` : ""}
              </span>
            )}
          </button>

          <button
            id="nav-tab-debugger"
            className={`task-tab ${activeTab === "debugger" ? "active" : ""}`}
            onClick={() => setActiveTab("debugger")}
          >
            🧠 AI Debugger
            {detectedError && <span className="tab-tag tag-error">!</span>}
          </button>

          <button
            id="nav-tab-srs"
            className={`task-tab ${activeTab === "srs" ? "active" : ""}`}
            onClick={() => setActiveTab("srs")}
          >
            📄 SRS & Requirements
            {filename && <span className="tab-tag tag-info">Ready</span>}
          </button>

          <button
            id="nav-tab-analysis"
            className={`task-tab ${activeTab === "analysis" ? "active" : ""}`}
            onClick={() => setActiveTab("analysis")}
          >
            🛡 Quality & Docs
          </button>

          <button
            id="nav-tab-git"
            className={`task-tab ${activeTab === "git" ? "active" : ""}`}
            onClick={() => setActiveTab("git")}
          >
            🌿 Git
            {gitStatus?.modified && gitStatus.modified.length > 0 && (
              <span className="tab-tag tag-warn">{gitStatus.modified.length}M</span>
            )}
          </button>
        </nav>

        <div className="top-bar-meta">
          <button
            className="full-analysis-btn-top"
            onClick={runFullAnalysis}
            disabled={fullAnalysisLoading || !code.trim()}
          >
            {fullAnalysisLoading ? "⚡ Analyzing..." : "⚡ Run Full Analysis"}
          </button>

          <span className="meta-badge" title="Active Project">
            📁 {projectName || "Untitled"}
          </span>

          <span
            className="meta-badge meta-status"
            title="100% Offline: Local Ollama & ChromaDB Engine"
            onClick={() => setShowArchModal(true)}
            style={{ cursor: "pointer" }}
          >
            🟢 Offline
          </span>
        </div>
      </header>

      {/* ================= WORKBENCH BODY ================= */}
      <div className="workbench">
        {/* LEFT SIDEBAR: PROJECT MANAGEMENT */}
        <aside className="sidebar">
          <h2>Project</h2>

          <input
            type="file"
            id="srs-upload"
            accept=".pdf"
            style={{ display: "none" }}
            onChange={uploadSRS}
          />

          <label htmlFor="srs-upload" className="upload-button">
            📄 Upload SRS
          </label>

          {uploading && <p>Uploading & indexing SRS...</p>}
          {filename && <p>📄 {filename}</p>}

          <div className="project-management">
            <h3>Project Management</h3>

            <input
              id="project-name-input"
              type="text"
              placeholder="Enter project name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
            />

            <button
              id="save-project-btn"
              onClick={saveProject}
              disabled={projectLoading}
              title="Saves code, tests, requirements, traceability, analysis & docs"
            >
              {projectLoading ? "Saving State..." : "Save Project"}
            </button>

            <h4>Saved Projects</h4>

            {projects.length === 0 && (
              <p id="no-projects-msg">No saved projects.</p>
            )}

            {projects.map((project) => (
              <div className="project-item" key={project} data-project={project}>
                <span>{project}</span>

                <div>
                  <button
                    id={`load-project-${project}`}
                    onClick={() => openProject(project)}
                    disabled={projectLoading}
                  >
                    Load
                  </button>

                  <button
                    id={`delete-project-${project}`}
                    onClick={() => deleteProject(project)}
                    disabled={projectLoading}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {projectMessage && (
              <p className="project-message" id="project-message">
                {projectMessage}
              </p>
            )}
          </div>
        </aside>

        {/* CENTER DASHBOARDS */}
        <main className="chat-panel dashboard-panel">
          {/* DASHBOARD 1: CODE STUDIO */}
          {activeTab === "code" && (
            <div className="dashboard-view code-dashboard">
              <div className="dashboard-header">
                <div>
                  <h2>Code Studio</h2>
                  <p className="subtitle">
                    AI-assisted Python code generation, editing, and local execution
                  </p>
                </div>
              </div>

              <div className="code-assistant">
                <textarea
                  id="instruction-input"
                  placeholder="Tell AI what code to create or modify..."
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  rows={3}
                />

                <div className="code-buttons">
                  <button
                    id="generate-code-btn"
                    onClick={generateCode}
                    disabled={generating}
                  >
                    {generating ? "Generating..." : "Generate Code"}
                  </button>

                  <button
                    id="run-code-btn"
                    onClick={runCode}
                    disabled={running || !code.trim()}
                  >
                    {running ? "Running..." : "Run Code"}
                  </button>

                  <button
                    id="clear-code-btn"
                    onClick={clearEditor}
                    className="clear-button"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="editor-container" id="editor-container">
                <div className="editor-top-bar">
                  <span className="editor-file-tab">🐍 main.py</span>
                  <span className="editor-lang-badge">Python • {code.split("\n").length} lines</span>
                </div>
                <Editor
                  height="450px"
                  defaultLanguage="python"
                  language="python"
                  value={code}
                  onChange={(value) => setCode(value || "")}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    automaticLayout: true,
                    fontSize: 14,
                  }}
                />
              </div>

              <div className="output-panel">
                <h3>Program Output</h3>
                <pre id="output-pre">
                  {output || "Output will appear here..."}
                </pre>
              </div>
            </div>
          )}

          {/* DASHBOARD 2: TEST SUITE */}
          {activeTab === "tests" && (
            <div className="dashboard-view tests-dashboard">
              <div className="dashboard-header">
                <div>
                  <h2>Test Suite</h2>
                  <p className="subtitle">
                    Automated Pytest unit test generator and runner
                  </p>
                </div>
              </div>

              <div className="test-instruction">
                <label htmlFor="test-instruction">
                  Test Generation Instruction
                </label>

                <input
                  id="test-instruction"
                  type="text"
                  value={testInstruction}
                  onChange={(event) => setTestInstruction(event.target.value)}
                  placeholder="Describe specific test cases or leave blank for automated full coverage..."
                />
              </div>

              <div className="editor-section">
                <h3>Generated Pytest Tests</h3>

                <div className="code-buttons">
                  <button
                    id="generate-tests-btn"
                    onClick={generateTests}
                    disabled={testLoading || !code.trim()}
                  >
                    {testLoading ? "Generating Tests..." : "Generate Tests"}
                  </button>

                  <button
                    id="run-tests-btn"
                    onClick={runTests}
                    disabled={testRunLoading || !code.trim() || !generatedTests.trim()}
                  >
                    {testRunLoading ? "Running Tests..." : "Run Tests"}
                  </button>

                  {testResults && (testResults.failed > 0 || testResults.errors > 0) && (
                    <button
                      onClick={() => setActiveTab("debugger")}
                      style={{ background: "#a12626" }}
                    >
                      Send Failures to AI Debugger ➔
                    </button>
                  )}
                </div>

                <div className="editor-container">
                  <div className="editor-top-bar">
                    <span className="editor-file-tab">🧪 test_suite.py</span>
                    <span className="editor-lang-badge">Pytest • {generatedTests ? generatedTests.split("\n").length : 0} lines</span>
                  </div>
                  <Editor
                    height="360px"
                    defaultLanguage="python"
                    language="python"
                    theme="vs-dark"
                    value={generatedTests}
                    onChange={(value) => setGeneratedTests(value || "")}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      automaticLayout: true,
                    }}
                  />
                </div>

                {testMessage && <p className="test-message">{testMessage}</p>}
              </div>

              {testResults && (
                <div className="test-results">
                  <h3>Test Execution Results</h3>

                  <div className="test-summary">
                    <div>
                      <strong>Passed</strong>
                      <span>{testResults.passed}</span>
                    </div>

                    <div>
                      <strong>Failed</strong>
                      <span>{testResults.failed}</span>
                    </div>

                    <div>
                      <strong>Errors</strong>
                      <span>{testResults.errors}</span>
                    </div>

                    <div>
                      <strong>Time</strong>
                      <span>{testResults.execution_time}s</span>
                    </div>
                  </div>

                  {testResults.output && (
                    <pre className="test-output">{testResults.output}</pre>
                  )}

                  {testResults.error && (
                    <pre className="test-error">{testResults.error}</pre>
                  )}
                </div>
              )}
            </div>
          )}

          {/* DASHBOARD 3: AI DEBUGGER */}
          {activeTab === "debugger" && (
            <div className="dashboard-view debugger-dashboard">
              <div className="dashboard-header">
                <div>
                  <h2>AI Debugger</h2>
                  <p className="subtitle">
                    Error trace ingestion, root-cause diagnosis, and automated code repair
                  </p>
                </div>
              </div>

              <div className="debug-section">
                <h3>Execution Error Context</h3>

                {detectedError ? (
                  <div className="detected-error-box">
                    <span className="error-badge">Active Error Captured</span>
                    <pre>{detectedError}</pre>
                  </div>
                ) : (
                  <div className="no-error-box">
                    <p>
                      ℹ️ No execution errors currently detected. Run your code or test suite to capture error traces automatically.
                    </p>
                  </div>
                )}

                <div className="code-buttons" style={{ marginTop: "14px" }}>
                  <button onClick={debugCode} disabled={debugLoading}>
                    {debugLoading ? "Analyzing Error..." : "Debug with AI"}
                  </button>
                </div>

                {debugMessage && <p className="debug-message">{debugMessage}</p>}
              </div>

              {debugResult && (
                <div className="debug-result">
                  <h3>AI Debugging Analysis</h3>
                  <pre>{debugResult}</pre>
                </div>
              )}
            </div>
          )}

          {/* DASHBOARD 4: SRS & REQUIREMENTS */}
          {activeTab === "srs" && (
            <div className="dashboard-view srs-dashboard">
              <div className="dashboard-header">
                <div>
                  <h2>SRS & Requirements</h2>
                  <p className="subtitle">
                    SRS documentation, software specifications, and traceability analysis
                  </p>
                </div>
              </div>

              <div className="requirements-section">
                <h3>Software Requirements</h3>

                <textarea
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  placeholder={`Enter your software requirements...

Example:
REQ-001: The system must divide two numbers.
REQ-002: The system must handle division by zero.`}
                  rows={6}
                />

                <button
                  id="generate-traceability-btn"
                  onClick={generateTraceability}
                  disabled={traceabilityLoading || !requirements.trim()}
                >
                  {traceabilityLoading
                    ? "Generating Matrix..."
                    : "Generate Traceability Matrix"}
                </button>

                {!requirements.trim() && (
                  <p style={{ fontSize: "12px", color: "#71717a", marginTop: "8px", margin: "8px 0 0 0" }}>
                    ℹ️ Enter or paste software requirements above to generate the traceability matrix.
                  </p>
                )}

                {traceabilityMessage && (
                  <p className="traceability-message">{traceabilityMessage}</p>
                )}
              </div>

              {traceability && (
                <div className="traceability-result">
                  <h3>Requirement Traceability Matrix</h3>
                  <pre>{traceability}</pre>
                </div>
              )}

              <div className="srs-chat-section">
                <h3>SRS Q&A Assistant</h3>
                <p style={{ color: "#777", fontSize: "13px", marginTop: 0 }}>
                  Ask questions regarding the uploaded SRS document ({filename || "no document uploaded yet"}).
                </p>

                <div className="chat-box">
                  {loading && <p>🤖 Thinking...</p>}
                  {answer && !loading && <p>{answer}</p>}
                  {!answer && !loading && (
                    <p style={{ color: "#999" }}>
                      Ask questions about requirements, edge cases, or architecture.
                    </p>
                  )}
                </div>

                <div className="input-area">
                  <input
                    type="text"
                    placeholder="Ask something about the SRS..."
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        askQuestion();
                      }
                    }}
                  />

                  <button onClick={askQuestion} disabled={loading}>
                    {loading ? "Thinking..." : "Ask"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* DASHBOARD 5: QUALITY & DOCS */}
          {activeTab === "analysis" && (
            <div className="dashboard-view quality-dashboard">
              <div className="dashboard-header">
                <div>
                  <h2>Code Quality & Documentation</h2>
                  <p className="subtitle">
                    Security auditing, complexity evaluation, and technical documentation
                  </p>
                </div>
              </div>

              <div className="analysis-section">
                <h3>Code Quality & Security Audit</h3>
                <p style={{ color: "#777", fontSize: "13px", marginTop: 0 }}>
                  Evaluate maintainability, potential security vulnerabilities, and best practices.
                </p>

                <button onClick={analyzeCode} disabled={analysisLoading || !code.trim()}>
                  {analysisLoading ? "Analyzing Code..." : "Analyze Code"}
                </button>

                {analysisMessage && (
                  <p className="analysis-message">{analysisMessage}</p>
                )}
              </div>

              {analysisResult && (
                <div className="analysis-result">
                  <h3>Code Analysis Report</h3>
                  <pre>{analysisResult}</pre>
                </div>
              )}

              <div className="documentation-section">
                <h3>Technical Documentation</h3>
                <p style={{ color: "#777", fontSize: "13px", marginTop: 0 }}>
                  Generate comprehensive technical specifications including function signatures, parameters, usage, and logic details.
                </p>

                <button
                  onClick={generateDocumentation}
                  disabled={documentationLoading || !code.trim()}
                >
                  {documentationLoading
                    ? "Generating Documentation..."
                    : "Generate Documentation"}
                </button>

                {documentationMessage && (
                  <p className="documentation-message">{documentationMessage}</p>
                )}
              </div>

              {documentation && (
                <div className="documentation-result">
                  <h3>Technical Documentation</h3>
                  <pre>{documentation}</pre>
                </div>
              )}
            </div>
          )}

          {/* DASHBOARD 6: GIT INTEGRATION */}
          {activeTab === "git" && (
            <div className="dashboard-view git-dashboard">
              <div className="dashboard-header">
                <div>
                  <h2>Git Version Control</h2>
                  <p className="subtitle">
                    Local repository tracking, staging, commits, and history log
                  </p>
                </div>
              </div>

              <div className="git-section">
                <div className="git-status-header">
                  <div>
                    <strong>Repository:</strong>{" "}
                    {gitStatus?.is_repo ? (
                      <span className="git-badge badge-repo">
                        Active ({gitStatus.branch})
                      </span>
                    ) : (
                      <span className="git-badge badge-untracked">Not Initialized</span>
                    )}
                  </div>

                  {!gitStatus?.is_repo && (
                    <button onClick={initGit} disabled={gitLoading}>
                      Initialize Git Repository
                    </button>
                  )}

                  {gitStatus?.is_repo && (
                    <button
                      onClick={() => {
                        fetchGitStatus(projectName);
                        fetchGitLog(projectName);
                      }}
                      disabled={gitLoading}
                    >
                      Refresh Status
                    </button>
                  )}
                </div>

                {gitFeedback && <p className="git-feedback">{gitFeedback}</p>}

                {gitStatus?.is_repo && (
                  <div className="git-work-panel">
                    <div className="git-file-lists">
                      <div>
                        <h4>Modified Files</h4>
                        {gitStatus.modified.length === 0 ? (
                          <p className="git-empty-msg">No modified files</p>
                        ) : (
                          <ul className="git-file-list">
                            {gitStatus.modified.map((f) => (
                              <li key={f} className="git-file-mod">
                                ✎ {f}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div>
                        <h4>Untracked Files</h4>
                        {gitStatus.untracked.length === 0 ? (
                          <p className="git-empty-msg">No untracked files</p>
                        ) : (
                          <ul className="git-file-list">
                            {gitStatus.untracked.map((f) => (
                              <li key={f} className="git-file-new">
                                + {f}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="git-commit-box">
                      <h4>Commit Changes</h4>
                      <input
                        type="text"
                        placeholder="Commit message (e.g. 'Add authentication logic and pytest tests')"
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitGit();
                        }}
                      />
                      <button
                        onClick={commitGit}
                        disabled={gitLoading || !commitMessage.trim()}
                        style={{ marginTop: "8px" }}
                      >
                        {gitLoading ? "Committing..." : "Commit"}
                      </button>
                    </div>

                    <div className="git-log-section">
                      <h4>Recent Commit History ({gitCommits.length})</h4>
                      {gitCommits.length === 0 ? (
                        <p className="git-empty-msg">No commits recorded yet.</p>
                      ) : (
                        <div className="git-commit-list">
                          {gitCommits.map((c) => (
                            <div key={c.hash} className="git-commit-item">
                              <span className="commit-hash">[{c.hash}]</span>
                              <span className="commit-msg">{c.message}</span>
                              <span className="commit-meta">
                                {c.author} • {c.time}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* RIGHT PANEL: LIVE PROJECT STATUS DASHBOARD */}
        <aside className="info-panel">
          <h2>Project Status</h2>

          <div className="status-grid">
            <div className="status-card">
              <div className="status-label">SRS Document</div>
              <div className={`status-val ${filename ? "val-ok" : "val-pending"}`}>
                {filename ? `● Uploaded` : "○ None"}
              </div>
              {filename && <div className="status-sub">{filename}</div>}
            </div>

            <div className="status-card">
              <div className="status-label">Requirements</div>
              <div className={`status-val ${requirementsCount > 0 ? "val-ok" : "val-pending"}`}>
                {requirementsCount > 0 ? `● ${requirementsCount} detected` : "○ Pending"}
              </div>
            </div>

            <div className="status-card">
              <div className="status-label">Source Code</div>
              <div className={`status-val ${code.trim() ? "val-ok" : "val-pending"}`}>
                {code.trim() ? `● Ready (${code.split("\n").length} lines)` : "○ Empty"}
              </div>
            </div>

            <div className="status-card">
              <div className="status-label">Test Suite</div>
              <div
                className={`status-val ${
                  testResults
                    ? testResults.failed > 0 || testResults.errors > 0
                      ? "val-warn"
                      : "val-ok"
                    : generatedTests
                    ? "val-info"
                    : "val-pending"
                }`}
              >
                {testResults
                  ? `● ${testResults.passed + testResults.failed + testResults.errors} run (${testResults.passed} passed, ${testResults.failed} failed)`
                  : generatedTests
                  ? `● Generated`
                  : "○ Not generated"}
              </div>
            </div>

            <div className="status-card">
              <div className="status-label">Traceability</div>
              <div className={`status-val ${traceability ? "val-ok" : "val-pending"}`}>
                {traceability
                  ? `● Covered (${(traceability.match(/Covered/g) || []).length} items)`
                  : "○ Pending"}
              </div>
            </div>

            <div className="status-card">
              <div className="status-label">Security & Quality</div>
              <div className={`status-val ${analysisResult ? "val-ok" : "val-pending"}`}>
                {analysisResult ? "● Audited" : "○ Pending audit"}
              </div>
            </div>

            <div className="status-card">
              <div className="status-label">Documentation</div>
              <div className={`status-val ${documentation ? "val-ok" : "val-pending"}`}>
                {documentation ? "● Generated" : "○ Not generated"}
              </div>
            </div>

            <div className="status-card">
              <div className="status-label">Git Repository</div>
              <div className={`status-val ${gitStatus?.is_repo ? "val-ok" : "val-pending"}`}>
                {gitStatus?.is_repo
                  ? `● ${gitStatus.commits_count} commits (${gitStatus.branch})`
                  : "○ Not initialized"}
              </div>
            </div>
          </div>

          <div style={{ marginTop: "16px" }}>
            <button
              className="full-analysis-btn"
              onClick={runFullAnalysis}
              disabled={fullAnalysisLoading || !code.trim()}
              title="Run complete end-to-end engineering pipeline"
            >
              {fullAnalysisLoading ? "⚡ Analyzing..." : "⚡ Run Full Analysis"}
            </button>

            <button
              className="arch-btn"
              onClick={() => setShowArchModal(true)}
              style={{ marginTop: "8px", width: "100%", background: "#444" }}
            >
              🏛️ View Architecture
            </button>
          </div>

          <div
            className="security-notice"
            style={{
              marginTop: "16px",
              fontSize: "11px",
              color: "#888",
              borderTop: "1px solid #ddd3bb",
              paddingTop: "12px",
              lineHeight: "1.4",
            }}
          >
            <strong>Security Boundary:</strong> Local execution is protected by application-level validation and resource limits; it is not intended as a production-grade security sandbox.
          </div>
        </aside>
      </div>

      {/* ================= MODAL: PROJECT REPORT ================= */}
      {showReportModal && projectReport && (
        <div className="modal-backdrop" onClick={() => setShowReportModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Executive Project Report</h3>
              <button
                className="modal-close-btn"
                onClick={() => setShowReportModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="ascii-report-card">
              <pre className="ascii-pre">
{`╔════════════════════════════════════════════════╗
║             PROJECT REPORT                     ║
╠════════════════════════════════════════════════╣
║ Tests Passed   : ${String(projectReport.tests_passed).padEnd(2)} / ${String(projectReport.tests_total).padEnd(2)}                        ║
║ Test Coverage  : ${String(projectReport.coverage_percent).padEnd(3)}%                            ║
║ Security Warnings: ${String(projectReport.security_warnings).padEnd(2)}                          ║
║ Quality Issues : ${String(projectReport.quality_issues).padEnd(2)}                          ║
║ Requirements   : ${String(projectReport.requirements_covered).padEnd(2)} / ${String(projectReport.requirements_total).padEnd(2)} Covered                 ║
║ Documentation  : ${projectReport.documentation_generated ? "Generated ✅" : "Pending   ⚠️"}                  ║
╚════════════════════════════════════════════════╝`}
              </pre>
            </div>

            <div className="report-summary-box">
              <strong>Audit Summary:</strong> {projectReport.summary}
            </div>

            <div className="report-actions">
              <button onClick={() => setShowReportModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: OFFLINE ARCHITECTURE ================= */}
      {showArchModal && (
        <div className="modal-backdrop" onClick={() => setShowArchModal(false)}>
          <div className="modal-content arch-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Offline AI Workbench Architecture</h3>
              <button
                className="modal-close-btn"
                onClick={() => setShowArchModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="arch-diagram">
              <pre className="ascii-pre">
{`                 OFFLINE AI WORKBENCH
                         │
          ┌──────────────┼──────────────┐
          ↓              ↓              ↓
       React          FastAPI        Ollama
          │              │              │
          │              │        ┌─────┴─────┐
          │              │        ↓           ↓
          │              │     Qwen3 4B   Qwen2.5
          │              │                 Coder 7B
          │              │
          │              ↓
          │          ChromaDB
          │              │
          │        nomic-embed-text
          │
          ↓
       Monaco`}
              </pre>
            </div>

            <div className="arch-guarantee">
              <strong>Local Isolation Guarantee:</strong> No external LLM API is required for core AI functionality. All neural inference and vector embeddings run strictly on localhost.
            </div>

            <div className="report-actions">
              <button onClick={() => setShowArchModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
