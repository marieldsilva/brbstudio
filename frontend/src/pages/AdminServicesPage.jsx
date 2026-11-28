import { useEffect, useRef, useState } from 'react';
import AdminLayout from '../components/AdminLayout.jsx';
import { ADMIN_SESSION_EXPIRED_EVENT, AdminApiError, deleteRequest, getJson, sendJson } from '../lib/adminApi.js';

const API_BASE = '/api/admin/services';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function formatPrice(price) {
  const amount = Number(price);
  const decimals = Number.isInteger(amount) ? 0 : 2;
  return `₱ ${amount.toLocaleString('en-PH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function Dialog({ open, labelledBy, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={labelledBy}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        if (event.target === event.currentTarget || event.target.closest('[data-dialog-close]')) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

async function sendForm(url, method, formData) {
  let response;
  try {
    response = await fetch(url, { method, body: formData });
  } catch {
    throw new AdminApiError('Unable to reach the server. Please check your connection and try again.', 0);
  }
  if (response.status === 401) {
    window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT));
    throw new AdminApiError('Your session has ended. Please log in again.', 401);
  }
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

function FieldError({ children }) {
  return children ? <p className="field__error">{children}</p> : <p className="field__error" hidden></p>;
}

export default function AdminServicesPage() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [serviceToDelete, setServiceToDelete] = useState(null);
  const [formValues, setFormValues] = useState({ name: '', description: '', price: '', durationHours: '2', available: true });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [removeCurrentImage, setRemoveCurrentImage] = useState(false);
  const previewObjectUrl = useRef(null);
  const [toast, setToast] = useState(null);

  async function loadServices(initial = false) {
    if (initial) setLoading(true);
    setLoadError('');
    try {
      const data = await getJson(API_BASE);
      if (!Array.isArray(data)) throw new Error('The server returned an invalid services list.');
      setServices(data);
    } catch (error) {
      setLoadError(error.message || 'Unable to load services. Please refresh the page.');
    } finally {
      if (initial) setLoading(false);
    }
  }

  useEffect(() => { void loadServices(true); }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function showToast(message, type = 'success') {
    setToast({ message, type });
  }

  function clearPreview() {
    if (previewObjectUrl.current) {
      URL.revokeObjectURL(previewObjectUrl.current);
      previewObjectUrl.current = null;
    }
  }

  function setPreview(url) {
    clearPreview();
    setPreviewUrl(url);
  }

  function openServiceDialog(service = null) {
    setEditingService(service);
    setFieldErrors({});
    setFormError('');
    setImageFile(null);
    setRemoveCurrentImage(false);
    clearPreview();
    setPreviewUrl(service?.imageUrl ?? null);
    setFormValues({
      name: service?.name ?? '',
      description: service?.description ?? '',
      price: service?.price ?? '',
      durationHours: service?.durationHours ?? '2',
      available: service ? service.available : true,
    });
    setServiceDialogOpen(true);
  }

  function closeServiceDialog() {
    if (saving) return;
    setServiceDialogOpen(false);
    setEditingService(null);
    setFieldErrors({});
    setFormError('');
    setImageFile(null);
    clearPreview();
    setPreviewUrl(null);
  }

  function clearFieldError(name) {
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function updateForm(name, value) {
    setFormValues((current) => ({ ...current, [name]: value }));
    clearFieldError(name);
  }

  function handleImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      event.target.value = '';
      setFieldErrors((current) => ({
        ...current,
        image: file.size > MAX_IMAGE_BYTES ? 'Image must be 5 MB or smaller.' : 'Image must be a JPG, PNG or WEBP file.',
      }));
      return;
    }
    clearFieldError('image');
    clearPreview();
    const url = URL.createObjectURL(file);
    previewObjectUrl.current = url;
    setPreviewUrl(url);
    setImageFile(file);
    setRemoveCurrentImage(false);
  }

  function removeImage() {
    clearPreview();
    setPreviewUrl(null);
    setImageFile(null);
    setRemoveCurrentImage(Boolean(editingService?.imageUrl));
  }

  function canInsertPrice(text) {
    const input = document.getElementById('servicePrice');
    const start = input?.selectionStart ?? formValues.price.length;
    const end = input?.selectionEnd ?? start;
    return /^\d{0,4}$/.test(formValues.price.slice(0, start) + text + formValues.price.slice(end));
  }

  const isWorkshop = /modeling workshop/i.test(formValues.name);

  async function handleSubmit(event) {
    event.preventDefault();
    setFieldErrors({});
    setFormError('');
    setSaving(true);
    try {
      const formData = new FormData();
      formData.set('name', formValues.name);
      formData.set('description', formValues.description);
      formData.set('price', formValues.price);
      if (!isWorkshop) formData.set('durationHours', formValues.durationHours);
      formData.set('available', String(formValues.available));
      if (imageFile) formData.set('image', imageFile);
      if (removeCurrentImage) formData.set('removeImage', 'true');

      const saved = editingService
        ? await sendForm(`${API_BASE}/${editingService.id}`, 'PUT', formData)
        : await sendForm(API_BASE, 'POST', formData);

      setServices((current) => editingService
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [...current, saved]);
      setServiceDialogOpen(false);
      setEditingService(null);
      clearPreview();
      setPreviewUrl(null);
      showToast(editingService ? `${saved.name} was updated.` : `${saved.name} was added.`);
    } catch (error) {
      const fieldErrorMap = error.fieldErrors ?? {};
      if (Object.keys(fieldErrorMap).length) setFieldErrors(fieldErrorMap);
      else setFormError(error.message || 'Unable to save this service. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailability(service, available) {
    try {
      const updated = await sendJson(`${API_BASE}/${service.id}/availability`, 'PATCH', { available });
      setServices((current) => current.map((item) => item.id === updated.id ? updated : item));
      showToast(`${updated.name} is now ${updated.available ? 'active' : 'inactive'}.`);
    } catch (error) {
      showToast(error.message || 'Unable to update availability.', 'error');
    }
  }

  function openDeleteDialog(service) {
    setServiceToDelete(service);
    setDeleteError('');
    setDeleteDialogOpen(true);
  }

  async function confirmDelete() {
    if (!serviceToDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteRequest(`${API_BASE}/${serviceToDelete.id}`);
      setServices((current) => current.filter((item) => item.id !== serviceToDelete.id));
      setDeleteDialogOpen(false);
      showToast(`${serviceToDelete.name} was removed.`);
      setServiceToDelete(null);
    } catch (error) {
      setDeleteError(error.message || 'Unable to remove this service. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AdminLayout activePage="services" title="Services | BRB Studios Admin">
      <main className="admin-main">
        <header className="page-header page-header--split">
          <div>
            <p className="page-header__eyebrow">Catalog</p>
            <h1 className="page-header__title">Services</h1>
          </div>
          <button className="btn btn--primary btn--lg" type="button" onClick={() => openServiceDialog()}>
            + Add Service
          </button>
        </header>

        {loading && <p className="status-message service-empty" role="status">Loading services...</p>}
        {!loading && loadError && <p className="status-message service-empty" role="alert">{loadError}</p>}
        {!loading && !loadError && (
          <section aria-label="Services offered by BRB Studios">
            {services.length > 0 && (
              <div className="service-grid">
                {services.map((service) => (
                  <article key={service.id} className={`panel service-card${service.available ? '' : ' service-card--inactive'}`}>
                    <div className="service-card__media">
                      {service.imageUrl
                        ? <img className="service-card__image" src={service.imageUrl} alt={service.name} />
                        : <span className="service-card__placeholder" aria-hidden="true"></span>}
                    </div>
                    <div className="service-card__body">
                      <header className="service-card__header">
                        <h2 className="service-card__name">{service.name}</h2>
                        <span className="service-card__status" title={service.available ? 'Active' : 'Inactive'}></span>
                      </header>
                      <p className="service-card__description" title={service.description}>{service.description}</p>
                      <p className="service-card__price-label">Price</p>
                      <p className="service-card__price">{formatPrice(service.price)}</p>
                      <p className="service-card__duration">
                        {service.durationHours === null
                          ? 'Whole day'
                          : `${service.durationHours} hour${service.durationHours === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    <footer className="service-card__footer">
                      <label className="switch">
                        <input
                          className="switch__input visually-hidden"
                          type="checkbox"
                          checked={service.available}
                          onChange={(event) => void toggleAvailability(service, event.target.checked)}
                        />
                        <span className="switch__track"></span>
                        <span className="switch__label">{service.available ? 'Active' : 'Inactive'}</span>
                      </label>
                      <button className="btn btn--danger" type="button" onClick={() => openDeleteDialog(service)}>
                        <span className="btn__icon btn__icon--trash" aria-hidden="true"></span>Remove
                      </button>
                      <button className="btn" type="button" onClick={() => openServiceDialog(service)}>
                        <span className="btn__icon btn__icon--edit" aria-hidden="true"></span>Edit
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
            )}
            {services.length === 0 && (
              <p className="status-message service-empty" role="status">
                No services yet. Click &quot;+ Add Service&quot; to create the first one.
              </p>
            )}
          </section>
        )}
      </main>

      <Dialog open={serviceDialogOpen} labelledBy="serviceDialogTitle" onClose={closeServiceDialog}>
        {serviceDialogOpen && (
          <form className="dialog__form" noValidate onSubmit={handleSubmit}>
            <h2 className="dialog__title" id="serviceDialogTitle">{editingService ? 'Edit Service' : 'Add Service'}</h2>
            {formError && <p className="alert alert--error" role="alert">{formError}</p>}

            <div className={`field${fieldErrors.name ? ' field--invalid' : ''}`}>
              <label className="field__label" htmlFor="serviceName">Service Name</label>
              <input
                className="field__input"
                id="serviceName"
                name="name"
                type="text"
                maxLength={100}
                required
                value={formValues.name}
                onChange={(event) => updateForm('name', event.target.value)}
              />
              <FieldError>{fieldErrors.name}</FieldError>
            </div>

            <div className={`field${fieldErrors.description ? ' field--invalid' : ''}`}>
              <label className="field__label" htmlFor="serviceDescription">Description</label>
              <textarea
                className="field__input"
                id="serviceDescription"
                name="description"
                maxLength={500}
                rows={3}
                required
                value={formValues.description}
                onChange={(event) => updateForm('description', event.target.value)}
              />
              <FieldError>{fieldErrors.description}</FieldError>
            </div>

            <div className={`field${fieldErrors.price ? ' field--invalid' : ''}`}>
              <label className="field__label" htmlFor="servicePrice">Price</label>
              <div className="input-group">
                <span className="input-group__prefix" aria-hidden="true">₱</span>
                <input
                  className="field__input"
                  id="servicePrice"
                  name="price"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  placeholder="1000"
                  required
                  value={formValues.price}
                  onBeforeInput={(event) => {
                    if (event.data !== null && !canInsertPrice(event.data)) event.preventDefault();
                  }}
                  onPaste={(event) => {
                    const text = event.clipboardData.getData('text');
                    if (!canInsertPrice(text)) event.preventDefault();
                  }}
                  onChange={(event) => updateForm('price', event.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </div>
              <p className="field__hint">Enter a whole-peso amount from ₱1,000 to ₱9,999.</p>
              <FieldError>{fieldErrors.price}</FieldError>
            </div>

            {!isWorkshop && (
              <div className={`field${fieldErrors.durationHours ? ' field--invalid' : ''}`}>
                <label className="field__label" htmlFor="serviceDuration">Duration (hours)</label>
                <input
                  className="field__input"
                  id="serviceDuration"
                  name="durationHours"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={formValues.durationHours}
                  onChange={(event) => updateForm('durationHours', event.target.value)}
                />
                <p className="field__hint">Enter a whole number of hours. Modeling Workshop is a full-day service.</p>
                <FieldError>{fieldErrors.durationHours}</FieldError>
              </div>
            )}

            <div className={`field image-field${fieldErrors.image ? ' field--invalid' : ''}`}>
              <span className="field__label">Service Picture</span>
              <div className="image-field__preview">
                {previewUrl
                  ? <img className="image-field__image" src={previewUrl} alt="Preview of the service picture" />
                  : <span className="image-field__placeholder" aria-hidden="true"></span>}
              </div>
              <input
                className="visually-hidden"
                id="serviceImage"
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImage}
              />
              <div className="image-field__actions">
                <label className="btn image-field__choose" htmlFor="serviceImage">Choose image</label>
                {(previewUrl || editingService?.imageUrl) && (
                  <button className="btn btn--danger" type="button" onClick={removeImage}>Remove image</button>
                )}
              </div>
              <p className="field__hint">JPG, PNG or WEBP, up to 5 MB. Shown to customers on the booking page.</p>
              <FieldError>{fieldErrors.image}</FieldError>
            </div>

            <div className="field">
              <label className="switch">
                <input
                  className="switch__input visually-hidden"
                  type="checkbox"
                  checked={formValues.available}
                  onChange={(event) => updateForm('available', event.target.checked)}
                />
                <span className="switch__track"></span>
                <span className="switch__label">{formValues.available ? 'Active' : 'Inactive'}</span>
              </label>
              <p className="field__hint">Inactive services are hidden from customers but kept in the catalog.</p>
            </div>

            <div className="dialog__actions">
              <button className="btn" type="button" disabled={saving} onClick={closeServiceDialog}>Cancel</button>
              <button className="btn btn--primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save Service'}
              </button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog open={deleteDialogOpen} labelledBy="deleteDialogTitle" onClose={() => { if (!deleting) setDeleteDialogOpen(false); }}>
        {deleteDialogOpen && (
          <div className="dialog__form">
            <h2 className="dialog__title" id="deleteDialogTitle">Remove service?</h2>
            <p className="dialog__text">
              &quot;{serviceToDelete?.name}&quot; will be permanently removed from the catalog. This can&apos;t be undone.
              If you only want to hide it from customers, set it to Inactive instead.
            </p>
            {deleteError && <p className="alert alert--error" role="alert">{deleteError}</p>}
            <div className="dialog__actions">
              <button className="btn" type="button" disabled={deleting} onClick={() => setDeleteDialogOpen(false)}>Cancel</button>
              <button className="btn btn--danger-solid" type="button" disabled={deleting} onClick={() => void confirmDelete()}>
                {deleting ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        )}
      </Dialog>

      {toast && (
        <p className={`toast${toast.type === 'error' ? ' toast--error' : ''}`} role="status">{toast.message}</p>
      )}
    </AdminLayout>
  );
}
