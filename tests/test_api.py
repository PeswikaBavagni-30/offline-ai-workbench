from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "Offline AI Workbench" in data["message"]


def test_list_projects_endpoint():
    response = client.get("/projects")
    assert response.status_code == 200
    data = response.json()
    assert "projects" in data
    assert isinstance(data["projects"], list)


def test_git_status_non_repo():
    response = client.get("/git/status?project_name=non_existent_project_99999")
    assert response.status_code == 200
    data = response.json()
    assert "is_repo" in data
    assert data["is_repo"] is False


def test_run_full_analysis_endpoint():
    from unittest.mock import patch, MagicMock

    with patch("backend.main.chat") as mock_chat:
        mock_msg = MagicMock()
        mock_msg.content = "Analysis & Documentation generated successfully."
        mock_chat.return_value.message = mock_msg

        payload = {
            "code": "def hello():\n    return 'hello world'\n",
            "tests": "from main import hello\ndef test_hello():\n    assert hello() == 'hello world'\n",
            "requirements": "REQ-001: The system must greet the user.",
            "instruction": "Test greeting function"
        }

        response = client.post("/run-full-analysis", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "report" in data
        report = data["report"]
        assert report["tests_passed"] == 1
        assert report["tests_total"] == 1
        assert report["coverage_percent"] == 100
        assert "documentation_generated" in report
        assert "security_check" in data

