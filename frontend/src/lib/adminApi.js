export const ADMIN_SESSION_EXPIRED_EVENT = 'brb:admin-session-expired';

export class AdminApiError extends Error {
  constructor(message, status, fieldErrors = {}) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function request(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new AdminApiError('Unable to reach the server. Please check your connection and try again.', 0);
  }

  if (response.status === 401) {
    window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT));
    throw new AdminApiError('Your session has ended. Please log in again.', 401);
  }

  if (response.status === 204) return null;

  let data;
  try {
    data = await response.json();
  } catch {
    throw new AdminApiError('The server returned an invalid response. Please try again.', response.status);
  }
  if (!response.ok) {
    throw new AdminApiError(data.message || 'Something went wrong. Please try again.', response.status, data.errors);
  }
  return data;
}

export const getJson = (url) => request(url);

export const sendJson = (url, method, body) => request(url, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const deleteRequest = (url) => request(url, { method: 'DELETE' });
