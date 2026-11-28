export async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export async function putJson(url, payload) {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export async function deleteJson(url) {
  const response = await fetch(url, { method: 'DELETE' });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export function getServerError(response, fieldNames) {
  const errors = response.data?.errors;
  const fieldErrors = {};

  if (errors && typeof errors === 'object') {
    Object.entries(errors).forEach(([name, message]) => {
      if (fieldNames.includes(name) && typeof message === 'string') {
        fieldErrors[name] = message;
      }
    });
  }

  return {
    fieldErrors,
    message: Object.keys(fieldErrors).length
      ? ''
      : response.data?.message || 'Something went wrong. Please try again.',
  };
}
