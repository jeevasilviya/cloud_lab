"use strict";

// ======================================================
// CONFIGURATION
// ======================================================

// Local SQLite API server.
const API_BASE_URL = "http://127.0.0.1:3000";
const PATIENTS_URL = `${API_BASE_URL}/patients`;

// ======================================================
// DOM ELEMENTS
// ======================================================

const patientForm = document.getElementById("patient-form");
const patientTableBody = document.getElementById("patient-table-body");

const searchInput = document.getElementById("search-input");
const refreshButton = document.getElementById("refresh-button");

const submitButton = document.getElementById("submit-button");
const resetButton = document.getElementById("reset-form");
const cancelEditButton = document.getElementById("cancel-edit");

const notification = document.getElementById("notification");

const totalPatientsElement = document.getElementById("total-patients");
const totalAppointmentsElement =
    document.getElementById("total-appointments");

const totalDepartmentsElement =
    document.getElementById("total-departments");

const recordCountElement = document.getElementById("record-count");
const lastUpdatedElement = document.getElementById("last-updated");

const connectionStatus = document.getElementById("connection-status");
const statusIndicator = document.querySelector(".status-indicator");

const appointmentList = document.getElementById("appointment-list");

const formTitle = document.getElementById("form-title");

// ======================================================
// APPLICATION STATE
// ======================================================

let patients = [];
let editingPatientId = null;
let notificationTimer = null;

// ======================================================
// HELPER FUNCTIONS
// ======================================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

function showNotification(message, type = "success") {
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.hidden = false;

    clearTimeout(notificationTimer);

    notificationTimer = setTimeout(() => {
        notification.hidden = true;
    }, 5000);

    notification.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
    });
}

function setConnectionStatus(online, message) {
    connectionStatus.textContent = message;

    statusIndicator.classList.remove("online", "offline");
    statusIndicator.classList.add(online ? "online" : "offline");
}

function formatDate(dateString) {
    if (!dateString) {
        return "Not scheduled";
    }

    // Parse the YYYY-MM-DD date as a local calendar date.
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);

    if (match) {
        const [, year, month, day] = match;

        const date = new Date(
            Number(year),
            Number(month) - 1,
            Number(day)
        );

        return date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    return escapeHTML(dateString);
}

function formatTime(timeString) {
    if (!timeString) {
        return "";
    }

    const match = /^(\d{2}):(\d{2})$/.exec(timeString);

    if (!match) {
        return escapeHTML(timeString);
    }

    const date = new Date();
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);

    return date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getPatientEndpoint(patientId) {
    return `${PATIENTS_URL}/${encodeURIComponent(patientId)}`;
}

async function apiRequest(url, options = {}) {
    let response;

    const method = String(options.method || "GET").toUpperCase();
    const hasRequestBody =
        Object.prototype.hasOwnProperty.call(options, "body") &&
        options.body !== undefined &&
        options.body !== null &&
        options.body !== "";

    const headers = { ...(options.headers || {}) };

    if (hasRequestBody && method !== "GET" && method !== "HEAD") {
        headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }

    try {
        response = await fetch(url, {
            ...options,
            headers
        });
    } catch (error) {
        throw new Error(
            "Could not connect to the CarePlus local API. Start the backend server on port 3000."
        );
    }

    const text = await response.text();

    let data = null;

    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
    }

    if (!response.ok) {
        const message =
            data && typeof data === "object" && data.error
                ? data.error
                : data && typeof data === "object" && data.message
                    ? data.message
                    : `Request failed with HTTP ${response.status}.`;

        throw new Error(message);
    }

    return data;
}

// ======================================================
// LOAD PATIENT RECORDS
// ======================================================

async function loadPatients() {
    patientTableBody.innerHTML = `
        <tr>
            <td colspan="5" class="empty-state">
                Loading patient records...
            </td>
        </tr>
    `;

    refreshButton.disabled = true;

    try {
        const data = await apiRequest(PATIENTS_URL);

        if (!Array.isArray(data)) {
            throw new Error(
                "The API response is not a patient list. Check your local API response."
            );
        }

        patients = data;

        setConnectionStatus(true, "API connected");

        renderPatients();
        updateDashboard();

        lastUpdatedElement.textContent =
            "Updated " +
            new Date().toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit"
            });

    } catch (error) {
        console.error("Error loading patients:", error);

        patients = [];

        patientTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    Could not load patient records.<br><br>
                    ${escapeHTML(error.message)}
                </td>
            </tr>
        `;

        updateDashboard();

        setConnectionStatus(false, "Connection failed");

        showNotification(error.message, "error");

    } finally {
        refreshButton.disabled = false;
    }
}

// ======================================================
// DISPLAY PATIENTS
// ======================================================

function renderPatients() {
    const searchTerm = searchInput.value.trim().toLowerCase();

    const filteredPatients = patients.filter(patient => {
        const searchableText = [
            patient.patientName,
            patient.patientId,
            patient.department,
            patient.phone
        ].join(" ").toLowerCase();

        return searchableText.includes(searchTerm);
    });

    recordCountElement.textContent =
        `${filteredPatients.length} record(s)`;

    if (filteredPatients.length === 0) {
        patientTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    ${
                        searchTerm
                            ? "No patients match your search."
                            : "No patient records yet. Register your first patient above."
                    }
                </td>
            </tr>
        `;

        return;
    }

    patientTableBody.innerHTML = filteredPatients.map(patient => {
        const patientId = escapeHTML(patient.patientId);
        const patientName = escapeHTML(patient.patientName);
        const age = escapeHTML(patient.age);
        const gender = escapeHTML(patient.gender);
        const phone = escapeHTML(patient.phone);
        const department = escapeHTML(patient.department);

        const date = patient.appointmentDate
            ? escapeHTML(formatDate(patient.appointmentDate))
            : "Not scheduled";

        const time = patient.appointmentTime
            ? escapeHTML(formatTime(patient.appointmentTime))
            : "";

        return `
            <tr>
                <td>
                    <span class="patient-name">${patientName}</span>
                    <span class="patient-subtitle">
                        ${age} years · ${gender}<br>
                        ${phone}
                    </span>
                </td>

                <td>
                    <span class="patient-id">${patientId}</span>
                </td>

                <td>
                    <span class="department-badge">${department}</span>
                </td>

                <td>
                    <span class="appointment-date">${date}</span>
                    <span class="appointment-time">${time}</span>
                </td>

                <td>
                    <div class="action-buttons">
                        <button
                            class="btn btn-secondary btn-small"
                            data-action="edit"
                            data-id="${patientId}">
                            Edit
                        </button>

                        <button
                            class="btn btn-danger btn-small"
                            data-action="delete"
                            data-id="${patientId}">
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

// ======================================================
// DASHBOARD COUNTS
// ======================================================

function updateDashboard() {
    totalPatientsElement.textContent = patients.length;

    const appointmentCount = patients.filter(patient => {
        return Boolean(patient.appointmentDate);
    }).length;

    totalAppointmentsElement.textContent = appointmentCount;

    const departments = new Set(
        patients
            .map(patient => patient.department)
            .filter(Boolean)
    );

    totalDepartmentsElement.textContent = departments.size;

    renderAppointments();
}

// ======================================================
// APPOINTMENT LIST
// ======================================================

function renderAppointments() {
    const scheduledPatients = patients
        .filter(patient => patient.appointmentDate)
        .sort((a, b) => {
            const dateA = `${a.appointmentDate} ${a.appointmentTime || ""}`;
            const dateB = `${b.appointmentDate} ${b.appointmentTime || ""}`;

            return dateA.localeCompare(dateB);
        });

    if (scheduledPatients.length === 0) {
        appointmentList.innerHTML = `
            <p class="empty-state">
                No appointments scheduled yet.
                Add an appointment using the patient form.
            </p>
        `;

        return;
    }

    appointmentList.innerHTML = scheduledPatients.map(patient => {
        const name = escapeHTML(patient.patientName);
        const department = escapeHTML(patient.department);
        const patientId = escapeHTML(patient.patientId);

        const date = escapeHTML(formatDate(patient.appointmentDate));

        const time = patient.appointmentTime
            ? escapeHTML(formatTime(patient.appointmentTime))
            : "Time not specified";

        return `
            <article class="appointment-card">
                <div class="appointment-calendar">▣</div>

                <div>
                    <h3>${name}</h3>

                    <p>${department}</p>

                    <p>${date} · ${time}</p>

                    <p class="appointment-id">
                        Patient ID: ${patientId}
                    </p>
                </div>
            </article>
        `;
    }).join("");
}

// ======================================================
// ADD OR UPDATE PATIENT
// ======================================================

patientForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!patientForm.reportValidity()) {
        return;
    }

    const formData = new FormData(patientForm);

    const patient = {
        patientName: String(formData.get("patientName")).trim(),
        age: Number(formData.get("age")),
        gender: formData.get("gender"),
        phone: String(formData.get("phone")).trim(),
        department: formData.get("department"),
        appointmentDate: formData.get("appointmentDate") || "",
        appointmentTime: formData.get("appointmentTime") || ""
    };

    if (
        !patient.patientName ||
        !Number.isInteger(patient.age) ||
        patient.age < 1 ||
        patient.age > 124
    ) {
        showNotification(
            "Enter a valid patient name and age.",
            "error"
        );

        return;
    }

    const isEditing = Boolean(editingPatientId);

    const url = isEditing
        ? getPatientEndpoint(editingPatientId)
        : PATIENTS_URL;

    const method = isEditing ? "PUT" : "POST";

    submitButton.disabled = true;

    submitButton.textContent = isEditing
        ? "Updating Patient..."
        : "Registering Patient...";

    try {
        await apiRequest(url, {
            method,
            body: JSON.stringify(patient)
        });

        showNotification(
            isEditing
                ? "Patient information updated successfully."
                : "Patient registered successfully.",
            "success"
        );

        resetPatientForm();

        await loadPatients();

    } catch (error) {
        console.error("Patient save failed:", error);

        showNotification(error.message, "error");

    } finally {
        submitButton.disabled = false;

        submitButton.textContent = editingPatientId
            ? "Update Patient"
            : "+ Register Patient";
    }
});

// ======================================================
// EDIT PATIENT
// ======================================================

function startEditing(patientId) {
    const patient = patients.find(
        item => item.patientId === patientId
    );

    if (!patient) {
        showNotification(
            "Patient record not found. Refresh the records.",
            "error"
        );

        return;
    }

    editingPatientId = patientId;

    document.getElementById("patientName").value =
        patient.patientName || "";

    document.getElementById("age").value =
        patient.age ?? "";

    document.getElementById("gender").value =
        patient.gender || "";

    document.getElementById("phone").value =
        patient.phone || "";

    document.getElementById("department").value =
        patient.department || "";

    document.getElementById("appointmentDate").value =
        patient.appointmentDate || "";

    document.getElementById("appointmentTime").value =
        patient.appointmentTime || "";

    formTitle.textContent = "Update Patient Information";

    submitButton.textContent = "Update Patient";

    cancelEditButton.hidden = false;

    document.getElementById("patient-form-section").scrollIntoView({
        behavior: "smooth"
    });
}

// ======================================================
// DELETE PATIENT
// ======================================================

async function deletePatient(patientId) {
    const patient = patients.find(
        item => item.patientId === patientId
    );

    if (!patient) {
        showNotification(
            "Patient record not found. Refresh the records.",
            "error"
        );

        return;
    }

    const confirmed = window.confirm(
        `Are you sure you want to delete the record for ${patient.patientName}?\n\nThis action cannot be undone.`
    );

    if (!confirmed) {
        return;
    }

    try {
        await apiRequest(getPatientEndpoint(patientId), {
            method: "DELETE"
        });

        if (editingPatientId === patientId) {
            resetPatientForm();
        }

        showNotification(
            "Patient record deleted successfully.",
            "success"
        );

        await loadPatients();

    } catch (error) {
        console.error("Patient deletion failed:", error);

        showNotification(error.message, "error");
    }
}

// ======================================================
// TABLE ACTION HANDLERS
// ======================================================

patientTableBody.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");

    if (!button) {
        return;
    }

    const patientId = button.dataset.id;
    const action = button.dataset.action;

    if (action === "edit") {
        startEditing(patientId);
    }

    if (action === "delete") {
        deletePatient(patientId);
    }
});

// ======================================================
// RESET FORM
// ======================================================

function resetPatientForm() {
    patientForm.reset();

    editingPatientId = null;

    formTitle.textContent = "Register New Patient";

    submitButton.textContent = "+ Register Patient";

    cancelEditButton.hidden = true;
}

resetButton.addEventListener("click", () => {
    resetPatientForm();
});

cancelEditButton.addEventListener("click", () => {
    resetPatientForm();

    showNotification(
        "Edit cancelled.",
        "info"
    );
});

// ======================================================
// SEARCH AND REFRESH
// ======================================================

searchInput.addEventListener("input", () => {
    renderPatients();
});

refreshButton.addEventListener("click", () => {
    loadPatients();
});

// ======================================================
// INITIALIZE APPLICATION
// ======================================================

document.addEventListener("DOMContentLoaded", () => {
    loadPatients();
});