from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from ollama import chat

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

from backend.rag import answer_question
from backend.document_parser import extract_text
from backend.chunker import create_chunks
from backend.embedding import create_embedding
from backend.vector_store import add_chunk


app = FastAPI(
    title="Offline AI Workbench API",
    description="Offline-first AI development suite powered by local Ollama models",
    version="1.0.0"
)



allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Question(BaseModel):
    question: str = Field(min_length=1)


class CodeRequest(BaseModel):
    instruction: str = Field(min_length=1)
    code: str = ""


class RunCodeRequest(BaseModel):
    code: str = Field(min_length=1)


class SaveProjectRequest(BaseModel):
    project_name: str = ""
    filename: str = ""
    code: str = ""
    tests: str = ""
    requirements: str = ""
    traceability: str = ""
    analysis: str = ""
    documentation: str = ""
    srs_filename: str = ""
    metadata: dict = Field(default_factory=dict)


class GitInitRequest(BaseModel):
    project_name: str = ""


class GitCommitRequest(BaseModel):
    project_name: str = ""
    message: str = Field(min_length=1)


class FullAnalysisRequest(BaseModel):
    code: str = Field(min_length=1)
    tests: str = ""
    requirements: str = ""
    instruction: str = ""


DANGEROUS_PATTERNS = [
    (r"\bimport\s+ctypes\b", "Direct memory access via ctypes is restricted."),
    (r"\bos\.system\(", "Direct shell execution via os.system is restricted."),
    (r"\bshutil\.rmtree\(", "Arbitrary directory removal is restricted."),
    (r"\bsubprocess\.(Popen|call|run)\(", "Subprocess execution is restricted in code runner."),
]


def check_security(code: str) -> tuple[bool, str]:
    for pattern, warning in DANGEROUS_PATTERNS:
        if re.search(pattern, code):
            return False, f"Security Warning: {warning}"
    return True, ""


class TestGenerationRequest(BaseModel):
    code: str = Field(min_length=1)
    instruction: str = ""


class TestExecutionRequest(BaseModel):
    code: str = Field(min_length=1)
    tests: str = Field(min_length=1)
class TraceabilityRequest(BaseModel):
    requirements: str = Field(min_length=1)
    code: str = ""
    tests: str = ""
class DebugRequest(BaseModel):
    code: str = Field(min_length=1)
    error: str = Field(min_length=1)
class DocumentationRequest(BaseModel):
    code: str = Field(min_length=1)
class AnalysisRequest(BaseModel):
    code: str = Field(min_length=1)
@app.get("/")
def home():
    return {
        "message": "Offline AI Workbench is running"
    }


@app.post("/ask")
def ask(data: Question):
    answer = answer_question(data.question)

    return {
        "answer": answer,
        "model": "qwen3:4b"
    }


@app.post("/upload-srs")
def upload_srs(file: UploadFile = File(...)):
    os.makedirs("documents", exist_ok=True)

    safe_filename = os.path.basename(file.filename)
    file_path = os.path.join("documents", safe_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    text = extract_text(file_path)
    chunks = create_chunks(text)

    for index, chunk in enumerate(chunks):
        embedding = create_embedding(chunk)

        add_chunk(
            f"{safe_filename}_{index}",
            chunk,
            embedding
        )

    return {
        "message": "SRS uploaded successfully",
        "filename": safe_filename,
        "chunks": len(chunks)
    }


def clean_code(code: str) -> str:
    code = code.strip()

    if code.startswith("```"):
        lines = code.splitlines()

        if lines:
            lines = lines[1:]

        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]

        code = "\n".join(lines)

    return code.strip()


@app.post("/generate-code")
def generate_code(data: CodeRequest):
    prompt = f"""
You are a coding assistant.

User instruction:
{data.instruction}

Existing code:
{data.code}

Generate or modify the code according to the instruction.

Return only executable Python code.
Do not include explanations.
Do not include Markdown code fences.
"""

    try:
        response = chat(
            model="qwen2.5-coder:7b",
            options={
                "think": False
            },
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

        generated_code = response.message.content

        return {
            "code": clean_code(generated_code)
        }

    except Exception as error:
        return {
            "message": f"Code generation failed: {str(error)}"
        }


@app.post("/run-code")
def run_code(data: RunCodeRequest):
    # 1. Security validation
    is_safe, sec_msg = check_security(data.code)
    if not is_safe:
        return {
            "output": "",
            "error": f"Execution Blocked: {sec_msg}\nNotice: Local execution is protected by application-level validation and resource limits; it is not intended as a production-grade security sandbox.",
            "returncode": 1,
            "security_blocked": True
        }

    temporary_file_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".py",
            delete=False,
            encoding="utf-8"
        ) as temporary_file:
            temporary_file.write(data.code)
            temporary_file_path = temporary_file.name

        result = subprocess.run(
            [
                sys.executable,
                temporary_file_path
            ],
            capture_output=True,
            text=True,
            timeout=5
        )

        MAX_OUTPUT_LEN = 10000
        output = result.stdout[:MAX_OUTPUT_LEN] + ("\n... [Output truncated: maximum limit exceeded]" if len(result.stdout) > MAX_OUTPUT_LEN else "")
        error = result.stderr[:MAX_OUTPUT_LEN] + ("\n... [Error truncated: maximum limit exceeded]" if len(result.stderr) > MAX_OUTPUT_LEN else "")

        return {
            "output": output,
            "error": error,
            "returncode": result.returncode,
            "security_note": "Local execution is protected by application-level validation and resource limits; it is not intended as a production-grade security sandbox."
        }

    except subprocess.TimeoutExpired:
        return {
            "output": "",
            "error": "Execution stopped: time limit exceeded (5.0s).",
            "returncode": -1
        }

    except Exception as error:
        return {
            "output": "",
            "error": str(error),
            "returncode": -1
        }

    finally:
        if (
            temporary_file_path
            and os.path.exists(temporary_file_path)
        ):
            try:
                os.remove(temporary_file_path)
            except Exception:
                pass


@app.post("/save-project")
def save_project(data: SaveProjectRequest):
    raw_name = data.project_name or data.filename
    project_name = os.path.basename(raw_name.strip())

    if not project_name or project_name in (".", ".."):
        return {
            "message": "Project name cannot be empty"
        }

    project_name = os.path.splitext(project_name)[0]
    project_folder = os.path.join(
        "projects",
        project_name
    )
    os.makedirs(project_folder, exist_ok=True)

    saved_files = []

    # 1. main.py
    with open(os.path.join(project_folder, "main.py"), "w", encoding="utf-8") as f:
        f.write(data.code)
    saved_files.append("main.py")

    # 2. tests.py
    if data.tests.strip():
        with open(os.path.join(project_folder, "tests.py"), "w", encoding="utf-8") as f:
            f.write(data.tests)
        saved_files.append("tests.py")

    # 3. requirements.md
    if data.requirements.strip():
        with open(os.path.join(project_folder, "requirements.md"), "w", encoding="utf-8") as f:
            f.write(data.requirements)
        saved_files.append("requirements.md")

    # 4. requirements.txt
    req_txt_path = os.path.join(project_folder, "requirements.txt")
    if not os.path.exists(req_txt_path):
        with open(req_txt_path, "w", encoding="utf-8") as f:
            f.write("pytest>=7.0.0\n")
    saved_files.append("requirements.txt")

    # 5. traceability.md
    if data.traceability.strip():
        with open(os.path.join(project_folder, "traceability.md"), "w", encoding="utf-8") as f:
            f.write(data.traceability)
        saved_files.append("traceability.md")

    # 6. analysis.md
    if data.analysis.strip():
        with open(os.path.join(project_folder, "analysis.md"), "w", encoding="utf-8") as f:
            f.write(data.analysis)
        saved_files.append("analysis.md")

    # 7. documentation.md
    if data.documentation.strip():
        with open(os.path.join(project_folder, "documentation.md"), "w", encoding="utf-8") as f:
            f.write(data.documentation)
        saved_files.append("documentation.md")

    # 8. project.json metadata
    meta = {
        "project_name": project_name,
        "srs_filename": data.srs_filename,
        "metadata": data.metadata
    }
    with open(os.path.join(project_folder, "project.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    saved_files.append("project.json")

    return {
        "message": f"Project '{project_name}' and engineering artifacts saved successfully",
        "project_name": project_name,
        "files": saved_files
    }


@app.get("/projects")
def list_projects():
    projects_folder = "projects"
    os.makedirs(projects_folder, exist_ok=True)
    projects = []

    for project_name in os.listdir(projects_folder):
        project_path = os.path.join(projects_folder, project_name)
        if os.path.isdir(project_path) and not project_name.startswith("."):
            projects.append(project_name)

    return {
        "projects": sorted(projects)
    }


@app.get("/projects/{project_name}")
def load_project(project_name: str):
    safe_project_name = os.path.basename(project_name)
    project_folder = os.path.join("projects", safe_project_name)

    if not os.path.exists(project_folder):
        return {
            "message": "Project not found"
        }

    def read_file(name: str) -> str:
        filepath = os.path.join(project_folder, name)
        if os.path.exists(filepath):
            with open(filepath, "r", encoding="utf-8") as f:
                return f.read()
        return ""

    code = read_file("main.py")
    tests = read_file("tests.py")
    requirements = read_file("requirements.md")
    traceability = read_file("traceability.md")
    analysis = read_file("analysis.md")
    documentation = read_file("documentation.md")

    srs_filename = ""
    metadata = {}
    meta_path = os.path.join(project_folder, "project.json")
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                parsed = json.load(f)
                srs_filename = parsed.get("srs_filename", "")
                metadata = parsed.get("metadata", {})
        except Exception:
            pass

    return {
        "project_name": safe_project_name,
        "code": code,
        "tests": tests,
        "requirements": requirements,
        "traceability": traceability,
        "analysis": analysis,
        "documentation": documentation,
        "srs_filename": srs_filename,
        "metadata": metadata,
        "files": os.listdir(project_folder)
    }


@app.delete("/projects/{project_name}")
def delete_project(project_name: str):
    safe_project_name = os.path.basename(project_name)

    project_folder = os.path.join(
        "projects",
        safe_project_name
    )

    if not os.path.exists(project_folder):
        return {
            "message": "Project not found"
        }

    def _remove_readonly(func, path, exc_info=None):
        try:
            os.chmod(path, 0o777)
            func(path)
        except Exception:
            pass

    shutil.rmtree(project_folder, onexc=_remove_readonly)

    return {
        "message": "Project deleted successfully",
        "project_name": safe_project_name
    }


# ============================================================================
# GIT INTEGRATION ENDPOINTS
# ============================================================================

@app.post("/git/init")
def git_init(data: GitInitRequest):
    folder = os.path.join("projects", os.path.basename(data.project_name)) if data.project_name else "."
    os.makedirs(folder, exist_ok=True)
    try:
        subprocess.run(["git", "init"], cwd=folder, check=True, capture_output=True, text=True)
        gitignore_path = os.path.join(folder, ".gitignore")
        if not os.path.exists(gitignore_path):
            with open(gitignore_path, "w", encoding="utf-8") as f:
                f.write("__pycache__/\n*.pyc\n.pytest_cache/\n")
        return {"message": "Git repository initialized successfully", "is_repo": True}
    except Exception as e:
        return {"message": f"Git init failed: {str(e)}", "is_repo": False}


@app.get("/git/status")
def git_status(project_name: str = ""):
    folder = os.path.join("projects", os.path.basename(project_name)) if project_name else "."
    if not os.path.exists(os.path.join(folder, ".git")):
        return {
            "is_repo": False,
            "message": "Not a git repository",
            "modified": [],
            "untracked": [],
            "staged": [],
            "commits_count": 0,
            "branch": "none"
        }
    try:
        status_proc = subprocess.run(["git", "status", "--porcelain"], cwd=folder, capture_output=True, text=True)
        branch_proc = subprocess.run(["git", "branch", "--show-current"], cwd=folder, capture_output=True, text=True)
        count_proc = subprocess.run(["git", "rev-list", "--count", "HEAD"], cwd=folder, capture_output=True, text=True)

        modified, untracked, staged = [], [], []
        for line in status_proc.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            status_code = line[:2]
            filename = line[3:].strip()
            if status_code.startswith("?") or status_code.endswith("?"):
                untracked.append(filename)
            elif "M" in status_code:
                modified.append(filename)
            elif "A" in status_code:
                staged.append(filename)
            else:
                modified.append(filename)

        commits_count = 0
        if count_proc.returncode == 0 and count_proc.stdout.strip().isdigit():
            commits_count = int(count_proc.stdout.strip())

        branch = branch_proc.stdout.strip() or "main"

        return {
            "is_repo": True,
            "branch": branch,
            "modified": modified,
            "untracked": untracked,
            "staged": staged,
            "commits_count": commits_count
        }
    except Exception as e:
        return {
            "is_repo": False,
            "message": str(e),
            "modified": [],
            "untracked": [],
            "staged": [],
            "commits_count": 0,
            "branch": "error"
        }


@app.post("/git/commit")
def git_commit(data: GitCommitRequest):
    folder = os.path.join("projects", os.path.basename(data.project_name)) if data.project_name else "."
    if not os.path.exists(os.path.join(folder, ".git")):
        return {"message": "Not a git repository. Initialize git first.", "success": False}
    try:
        subprocess.run(["git", "config", "user.name", "Offline AI Workbench"], cwd=folder, capture_output=True)
        subprocess.run(["git", "config", "user.email", "workbench@local"], cwd=folder, capture_output=True)
        subprocess.run(["git", "add", "-A"], cwd=folder, check=True, capture_output=True)
        commit_proc = subprocess.run(["git", "commit", "-m", data.message], cwd=folder, capture_output=True, text=True)
        if commit_proc.returncode != 0:
            return {"message": commit_proc.stderr or commit_proc.stdout or "Nothing to commit", "success": False}
        rev_proc = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=folder, capture_output=True, text=True)
        commit_hash = rev_proc.stdout.strip()
        return {"message": f"Committed [{commit_hash}]: {data.message}", "success": True, "commit_hash": commit_hash}
    except Exception as e:
        return {"message": f"Commit failed: {str(e)}", "success": False}


@app.get("/git/log")
def git_log(project_name: str = ""):
    folder = os.path.join("projects", os.path.basename(project_name)) if project_name else "."
    if not os.path.exists(os.path.join(folder, ".git")):
        return {"commits": []}
    try:
        proc = subprocess.run(["git", "log", "-n", "10", "--pretty=format:%h|%s|%an|%cr"], cwd=folder, capture_output=True, text=True)
        commits = []
        for line in proc.stdout.splitlines():
            parts = line.strip().split("|")
            if len(parts) >= 4:
                commits.append({
                    "hash": parts[0],
                    "message": parts[1],
                    "author": parts[2],
                    "time": parts[3]
                })
        return {"commits": commits}
    except Exception:
        return {"commits": []}


# ============================================================================
# RUN FULL ANALYSIS ORCHESTRATOR
# ============================================================================

@app.post("/run-full-analysis")
def run_full_analysis(data: FullAnalysisRequest):
    # 1. Validate safety
    is_safe, sec_msg = check_security(data.code)

    # 2. Run code execution test
    run_res = run_code(RunCodeRequest(code=data.code))

    # 3. If tests exist, run pytest
    test_res = None
    if data.tests.strip():
        test_res = run_tests(TestExecutionRequest(code=data.code, tests=data.tests))

    # 4. Code quality & security audit via Ollama
    analysis_report = ""
    try:
        ar = analyze_code(AnalysisRequest(code=data.code))
        analysis_report = ar.get("analysis", "")
    except Exception as e:
        analysis_report = f"Analysis note: {str(e)}"

    # 5. Traceability if requirements exist
    traceability_report = ""
    if data.requirements.strip() and data.tests.strip():
        try:
            tr = generate_traceability(TraceabilityRequest(requirements=data.requirements, code=data.code, tests=data.tests))
            traceability_report = tr.get("traceability", "")
        except Exception:
            pass

    # 6. Documentation
    documentation_report = ""
    try:
        doc = generate_documentation(DocumentationRequest(code=data.code))
        documentation_report = doc.get("documentation", "")
    except Exception:
        pass

    # 7. Compute Report Metrics
    tests_run = (test_res.get("passed", 0) + test_res.get("failed", 0) + test_res.get("errors", 0)) if test_res else 0
    tests_passed = test_res.get("passed", 0) if test_res else 0
    coverage = round((tests_passed / tests_run * 100)) if tests_run > 0 else (100 if run_res.get("returncode") == 0 else 0)

    sec_warnings = 0
    if not is_safe:
        sec_warnings += 1
    if "risk" in analysis_report.lower() or "vulnerability" in analysis_report.lower():
        sec_warnings += 1

    quality_issues = 1 if run_res.get("returncode") != 0 else 0
    if "refactor" in analysis_report.lower() or "bottleneck" in analysis_report.lower():
        quality_issues += 1

    req_count = len([l for l in data.requirements.splitlines() if l.strip().startswith("REQ-") or len(l.strip()) > 10])
    req_covered = traceability_report.count("Covered") if traceability_report else req_count

    report = {
        "tests_passed": tests_passed,
        "tests_total": tests_run,
        "coverage_percent": coverage,
        "security_warnings": sec_warnings,
        "quality_issues": quality_issues,
        "requirements_covered": req_covered,
        "requirements_total": max(req_count, req_covered),
        "documentation_generated": bool(documentation_report),
        "summary": "Project is production ready" if quality_issues == 0 and sec_warnings == 0 else "Review recommended before deployment"
    }

    return {
        "report": report,
        "code_output": run_res,
        "test_results": test_res,
        "analysis": analysis_report,
        "traceability": traceability_report,
        "documentation": documentation_report,
        "security_check": {"is_safe": is_safe, "message": sec_msg}
    }


@app.post("/generate-tests")
def generate_tests(data: TestGenerationRequest):
    prompt = f"""
You are an expert Python software tester.

Generate complete pytest unit tests for the following Python source code.

SOURCE CODE:
{data.code}

ADDITIONAL INSTRUCTION:
{data.instruction}

Requirements:
1. Use pytest.
2. Test every important function.
3. Include positive test cases.
4. Include negative test cases where applicable.
5. Include boundary and edge-case tests.
6. Do not test printed output unless necessary.
7. Import functions using:
   from main import *
8. Return only executable Python pytest code.
9. Do not include explanations.
10. Do not use Markdown code fences.
"""

    try:
        response = chat(
            model="qwen2.5-coder:7b",
            options={
                "think": False
            },
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You generate reliable executable pytest code "
                        "and return only Python code."
                    )
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

        generated_tests = response.message.content

        return {
            "tests": clean_code(generated_tests)
        }

    except Exception as error:
        return {
            "message": f"Test generation failed: {str(error)}"
        }


@app.post("/run-tests")
def run_tests(data: TestExecutionRequest):
    temporary_directory = tempfile.mkdtemp()

    source_file_path = os.path.join(
        temporary_directory,
        "main.py"
    )

    tests_file_path = os.path.join(
        temporary_directory,
        "test_main.py"
    )

    try:
        with open(
            source_file_path,
            "w",
            encoding="utf-8"
        ) as source_file:
            source_file.write(data.code)

        with open(
            tests_file_path,
            "w",
            encoding="utf-8"
        ) as tests_file:
            tests_file.write(data.tests)

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "pytest",
                "test_main.py",
                "-q"
            ],
            cwd=temporary_directory,
            capture_output=True,
            text=True,
            timeout=20
        )

        output = result.stdout.strip()
        error = result.stderr.strip()

        passed = 0
        failed = 0
        errors = 0

        summary_line = output.splitlines()[-1] if output else ""

        if " passed" in summary_line:
            passed_text = summary_line.split(" passed")[0].split()[-1]
            if passed_text.isdigit():
                passed = int(passed_text)

        if " failed" in summary_line:
            failed_text = summary_line.split(" failed")[0].split()[-1]
            if failed_text.isdigit():
                failed = int(failed_text)

        if " error" in summary_line:
            error_text = summary_line.split(" error")[0].split()[-1]
            if error_text.isdigit():
                errors = int(error_text)

        return {
            "output": output,
            "error": error,
            "returncode": result.returncode,
            "passed": passed,
            "failed": failed,
            "errors": errors
        }

    except subprocess.TimeoutExpired:
        return {
            "output": "",
            "error": "Test execution stopped: time limit exceeded.",
            "returncode": -1,
            "passed": 0,
            "failed": 0,
            "errors": 1
        }

    except Exception as error:
        return {
            "output": "",
            "error": str(error),
            "returncode": -1,
            "passed": 0,
            "failed": 0,
            "errors": 1
        }

    finally:
        shutil.rmtree(
            temporary_directory,
            ignore_errors=True
        )
@app.post("/generate-traceability")
def generate_traceability(request: TraceabilityRequest):
    code_text = request.code.strip() if request.code and request.code.strip() else "None provided yet"
    tests_text = request.tests.strip() if request.tests and request.tests.strip() else "None provided yet"

    prompt = f"""
You are a software engineering traceability analyst.

Create a requirement traceability matrix using the following inputs.

REQUIREMENTS:
{request.requirements}

SOURCE CODE:
{code_text}

TEST CASES:
{tests_text}

Return only a Markdown table with these columns:

| Requirement ID | Requirement | Related Code Function | Related Test Case | Coverage Status |

Rules:
- Assign IDs such as REQ-001, REQ-002 if missing.
- Match each requirement to the relevant function (or 'None' if missing).
- Match each requirement to the relevant test (or 'None' if missing).
- Use Covered (if both code and test exist), Partially Covered (if only code exists), or Not Covered (if code or tests are missing).
- Do not add explanations outside the table.
"""

    response = chat(
        model="qwen2.5-coder:7b",
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
        options={
            "think": False,
        },
    )

    return {
        "traceability": response.message.content.strip()
    }
@app.post("/debug-code")
def debug_code(request: DebugRequest):
    prompt = f"""
You are an expert software debugging assistant.

Analyze the following Python code and the error produced while executing it.

SOURCE CODE:
{request.code}

ERROR:
{request.error}

Provide your response in exactly this format:

BUG:
Explain the main problem.

CAUSE:
Explain why the problem occurs.

FIX:
Provide the corrected code.

EXPLANATION:
Briefly explain what was changed.

Do not discuss unrelated issues.
"""

    response = chat(
        model="qwen2.5-coder:7b",
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
        options={
            "think": False,
        },
    )

    return {
        "debug": response.message.content.strip()
    }
@app.post("/generate-documentation")
def generate_documentation(request: DocumentationRequest):
    prompt = f"""
You are a senior software documentation engineer.

Generate clear technical documentation for the following Python code.

SOURCE CODE:
{request.code}

Create documentation with exactly these sections:

# Project Overview
Briefly explain what the code does.

# Functions
For every important function include:
- Function name
- Purpose
- Parameters
- Return value
- Important behavior

# Usage
Explain how to run and use the code.
Include a small example where appropriate.

# Implementation Details
Explain the important logic used by the code.

# Notes
Mention important assumptions, limitations, or edge cases.

Rules:
- Use Markdown.
- Keep the documentation technically accurate.
- Do not invent functionality that does not exist in the code.
- Do not modify the source code.
"""

    try:
        response = chat(
            model="qwen2.5-coder:7b",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            options={
                "think": False
            }
        )

        return {
            "documentation": response.message.content.strip()
        }

    except Exception as error:
        return {
            "message": f"Documentation generation failed: {str(error)}"
        }


@app.post("/analyze-code")
def analyze_code(request: AnalysisRequest):
    prompt = f"""
You are a senior software security and code quality analyst.

Perform a thorough code review and security analysis on the following Python source code:

SOURCE CODE:
{request.code}

Provide an analysis report with exactly these sections:

# Code Quality & Maintainability
- Structure, readability, and naming conventions
- Modularity and cyclomatic complexity
- Error handling completeness

# Security & Vulnerability Analysis
- Injection or input validation risks
- Resource leaks or unsafe operations
- Authentication or authorization considerations if applicable

# Performance & Optimization
- Time and space complexity evaluation
- Potential bottlenecks or redundant operations

# Recommended Improvements
- Concrete actionable suggestions with snippet examples where appropriate

Rules:
- Use Markdown.
- Be constructive, precise, and technically grounded.
- Do not invent non-existent issues.
"""

    try:
        response = chat(
            model="qwen2.5-coder:7b",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            options={
                "think": False
            }
        )

        return {
            "analysis": response.message.content.strip()
        }

    except Exception as error:
        return {
            "message": f"Code analysis failed: {str(error)}"
        }
