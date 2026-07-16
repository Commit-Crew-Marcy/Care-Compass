"""CORS regression coverage for local Vite development servers."""
from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def preflight(origin: str):
    return client.options(
        "/api/eligibility/check",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )


def test_any_local_vite_port_is_allowed():
    response = preflight("http://localhost:5176")
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5176"


def test_127_local_vite_port_is_allowed():
    response = preflight("http://127.0.0.1:5199")
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5199"


def test_untrusted_external_origin_is_not_allowed():
    response = preflight("https://example.com")
    assert "access-control-allow-origin" not in response.headers
