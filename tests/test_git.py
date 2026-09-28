import os
import shutil
import stat
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def _remove_readonly(func, path, exc_info=None):
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception:
        pass


def test_git_workflow():
    project_name = "test_git_integration"
    project_dir = os.path.join("projects", project_name)

    if os.path.exists(project_dir):
        shutil.rmtree(project_dir, onexc=_remove_readonly)

    # 1. Save project first
    client.post("/save-project", json={
        "project_name": project_name,
        "code": "print('git test')"
    })

    # 2. Init git
    init_resp = client.post("/git/init", json={"project_name": project_name})
    assert init_resp.status_code == 200
    assert init_resp.json()["is_repo"] is True

    # 3. Check status
    status_resp = client.get(f"/git/status?project_name={project_name}")
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert status_data["is_repo"] is True
    assert len(status_data["untracked"]) > 0

    # 4. Commit
    commit_resp = client.post("/git/commit", json={
        "project_name": project_name,
        "message": "Initial commit from test"
    })
    assert commit_resp.status_code == 200
    commit_data = commit_resp.json()
    assert commit_data["success"] is True

    # 5. Log
    log_resp = client.get(f"/git/log?project_name={project_name}")
    assert log_resp.status_code == 200
    logs = log_resp.json()["commits"]
    assert len(logs) >= 1
    assert "Initial commit from test" in logs[0]["message"]

    # Clean up safely
    if os.path.exists(project_dir):
        shutil.rmtree(project_dir, onexc=_remove_readonly)
