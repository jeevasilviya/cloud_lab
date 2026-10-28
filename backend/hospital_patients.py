import json
import os
import uuid
from typing import Any, Dict, List

import boto3
from botocore.exceptions import ClientError

DYNAMODB_TABLE = os.environ.get("DYNAMODB_TABLE", "HospitalPatients")
ALLOWED_ORIGINS = {
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://localhost:3000",
    "http://localhost:8080",
}


def build_headers(origin: str | None = None) -> Dict[str, str]:
    allow_origin = origin if origin in ALLOWED_ORIGINS else "http://127.0.0.1:5500"
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": allow_origin,
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Max-Age": "300",
    }


def get_table():
    region = os.environ.get("AWS_REGION", "ap-south-1")
    dynamodb = boto3.resource("dynamodb", region_name=region)
    return dynamodb.Table(DYNAMODB_TABLE)


def parse_body(event: Dict[str, Any]) -> Dict[str, Any]:
    raw_body = event.get("body") or "{}"
    if isinstance(raw_body, str):
        return json.loads(raw_body)
    return raw_body


def normalize_patient(data: Dict[str, Any], patient_id: str | None = None) -> Dict[str, Any]:
    normalized = {
        "patientId": patient_id or str(data.get("patientId") or uuid.uuid4()),
        "patientName": str(data.get("patientName", "")).strip(),
        "age": int(data.get("age", 0)),
        "gender": str(data.get("gender", "")).strip(),
        "phone": str(data.get("phone", "")).strip(),
        "department": str(data.get("department", "")).strip(),
        "appointmentDate": str(data.get("appointmentDate", "")).strip(),
        "appointmentTime": str(data.get("appointmentTime", "")).strip(),
    }
    return normalized


def response(status_code: int, payload: Any, origin: str | None = None):
    body = json.dumps(payload, default=str)
    return {
        "statusCode": status_code,
        "headers": build_headers(origin),
        "body": body,
    }


def handle_get_all(origin: str | None = None):
    table = get_table()
    items = table.scan().get("Items", [])
    return response(200, items, origin)


def handle_get_one(patient_id: str, origin: str | None = None):
    table = get_table()
    item = table.get_item(Key={"patientId": patient_id}).get("Item")
    if not item:
        return response(404, {"error": "Patient not found."}, origin)
    return response(200, item, origin)


def handle_create(event: Dict[str, Any], origin: str | None = None):
    payload = parse_body(event)
    patient = normalize_patient(payload)

    if not patient["patientName"] or not patient["phone"] or not patient["department"]:
        return response(400, {"error": "patientName, phone, and department are required."}, origin)

    table = get_table()
    table.put_item(Item=patient)
    return response(201, patient, origin)


def handle_update(patient_id: str, event: Dict[str, Any], origin: str | None = None):
    payload = parse_body(event)

    table = get_table()
    existing = table.get_item(Key={"patientId": patient_id}).get("Item")
    if not existing:
        return response(404, {"error": "Patient not found."}, origin)

    merged = {**existing, **payload}
    patient = normalize_patient(merged, patient_id)

    if not patient["patientName"] or not patient["phone"] or not patient["department"]:
        return response(400, {"error": "patientName, phone, and department are required."}, origin)

    table.put_item(Item=patient)
    return response(200, patient, origin)


def handle_delete(patient_id: str, origin: str | None = None):
    table = get_table()
    existing = table.get_item(Key={"patientId": patient_id}).get("Item")
    if not existing:
        return response(404, {"error": "Patient not found."}, origin)

    table.delete_item(Key={"patientId": patient_id})
    return response(200, {"message": "Patient deleted successfully."}, origin)


def lambda_handler(event: Dict[str, Any], context: Any):
    origin = None
    headers = event.get("headers") or {}
    if isinstance(headers, dict):
        origin = headers.get("Origin") or headers.get("origin")

    if event.get("httpMethod") == "OPTIONS" or event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return response(200, {"message": "OK"}, origin)

    method = (event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method") or "GET").upper()
    path = event.get("rawPath") or event.get("path") or "/"
    path_parts = [part for part in path.split("/") if part]

    try:
        if method == "GET" and path_parts == ["patients"]:
            return handle_get_all(origin)

        if method == "GET" and len(path_parts) == 2 and path_parts[0] == "patients":
            return handle_get_one(path_parts[1], origin)

        if method == "POST" and path_parts == ["patients"]:
            return handle_create(event, origin)

        if method == "PUT" and len(path_parts) == 2 and path_parts[0] == "patients":
            return handle_update(path_parts[1], event, origin)

        if method == "DELETE" and len(path_parts) == 2 and path_parts[0] == "patients":
            return handle_delete(path_parts[1], origin)

        return response(404, {"error": "Route not found."}, origin)

    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        return response(400, {"error": f"Invalid request payload: {str(exc)}"}, origin)
    except ClientError as exc:
        return response(500, {"error": str(exc)}, origin)
