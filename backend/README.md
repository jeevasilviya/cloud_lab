# CarePlus Lambda Backend

This backend provides the AWS Lambda + API Gateway HTTP API for the CarePlus patient management dashboard.

## Deployment

1. Install the AWS SAM CLI.
2. From this folder, run:

```bash
sam build
sam deploy --guided
```

3. When prompted, keep the default stack name or set your own.
4. Accept the default region `ap-south-1`.
5. Confirm the DynamoDB table name `HospitalPatients`.

## API routes

- GET /patients
- GET /patients/{patientId}
- POST /patients
- PUT /patients/{patientId}
- DELETE /patients/{patientId}

## CORS

The Lambda returns the required CORS headers for the local Live Server frontend at `http://127.0.0.1:5500`.

## Frontend configuration

The UI already points to:

```js
const API_BASE_URL = "https://llqf9swtq4.execute-api.ap-south-1.amazonaws.com";
```

and uses `/patients` plus patient-specific routes.
