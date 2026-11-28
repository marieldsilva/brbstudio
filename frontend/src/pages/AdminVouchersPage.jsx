import { useEffect, useRef, useState } from 'react';
import AdminLayout from '../components/AdminLayout.jsx';
import { deleteRequest, getJson, sendJson } from '../lib/adminApi.js';

const API_BASE = '/api/admin/vouchers';
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function fromIsoDate(value) {
  const datePart = String(value ?? '').slice(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDate(value) {
  const date = fromIsoDate(value);
  return date ? DATE_FORMAT.format(date) : String(value ?? '');
}

function formatPeso(value) {
  const amount = Number(value);
  const decimals = Number.isInteger(amount) ? 0 : 2;
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function toCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

function getRemainingUses(voucher) {
  if (voucher.remainingUses !== null && voucher.remainingUses !== undefined) {
    const remaining = Number(voucher.remainingUses);
    if (Number.isFinite(remaining)) return toCount(remaining);
  }
  return Math.max(0, toCount(voucher.usageLimit) - toCount(voucher.usedCount));
}

function formatDiscount(voucher) {
  const value = Number(voucher.discountValue);
  const safeValue = Number.isFinite(value) ? value : 0;
  return voucher.discountType === 'Percentage' ? `${safeValue}%` : formatPeso(safeValue);
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

function FieldError({ children }) {
  return children ? <p className="field__error">{children}</p> : <p className="field__error" hidden></p>;
}

export default function AdminVouchersPage() {
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [voucherDialogOpen, setVoucherDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState(null);
  const [voucherToDelete, setVoucherToDelete] = useState(null);
  const [formValues, setFormValues] = useState({
    code: '',
    name: '',
    discountType: 'Percentage',
    discountValue: '',
    startDate: '',
    endDate: '',
    usageLimit: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);

  async function loadVouchers(initial = false) {
    if (initial) setLoading(true);
    setLoadError('');
    try {
      const data = await getJson(API_BASE);
      if (!Array.isArray(data)) throw new Error('The server returned an invalid vouchers list.');
      setVouchers(data);
    } catch (error) {
      setLoadError(error.message || 'Unable to load vouchers. Please refresh the page.');
    } finally {
      if (initial) setLoading(false);
    }
  }

  useEffect(() => { void loadVouchers(true); }, []);
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) void loadVouchers(false);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function showToast(message, type = 'success') {
    setToast({ message, type });
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

  function openVoucherDialog(voucher = null) {
    setEditingVoucher(voucher);
    setFieldErrors({});
    setFormError('');
    setFormValues({
      code: voucher?.code ?? '',
      name: voucher?.name ?? '',
      discountType: voucher?.discountType ?? 'Percentage',
      discountValue: voucher?.discountValue ?? '',
      startDate: String(voucher?.startDate ?? '').slice(0, 10),
      endDate: String(voucher?.endDate ?? '').slice(0, 10),
      usageLimit: voucher?.usageLimit ?? '',
    });
    setVoucherDialogOpen(true);
  }

  function closeVoucherDialog() {
    if (saving) return;
    setVoucherDialogOpen(false);
    setEditingVoucher(null);
    setFieldErrors({});
    setFormError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFieldErrors({});
    setFormError('');
    setSaving(true);
    try {
      const saved = editingVoucher
        ? await sendJson(`${API_BASE}/${editingVoucher.id}`, 'PUT', formValues)
        : await sendJson(API_BASE, 'POST', formValues);

      setVouchers((current) => editingVoucher
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [...current, saved]);
      setVoucherDialogOpen(false);
      setEditingVoucher(null);
      showToast(editingVoucher ? `${saved.code} was updated.` : `${saved.code} was added.`);
    } catch (error) {
      const fieldErrorMap = error.fieldErrors ?? {};
      if (Object.keys(fieldErrorMap).length) setFieldErrors(fieldErrorMap);
      else setFormError(error.message || 'Unable to save this voucher. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function openDeleteDialog(voucher) {
    setVoucherToDelete(voucher);
    setDeleteError('');
    setDeleteDialogOpen(true);
  }

  async function confirmDelete() {
    if (!voucherToDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteRequest(`${API_BASE}/${voucherToDelete.id}`);
      setVouchers((current) => current.filter((item) => item.id !== voucherToDelete.id));
      setDeleteDialogOpen(false);
      showToast(`${voucherToDelete.code} was removed.`);
      setVoucherToDelete(null);
    } catch (error) {
      setDeleteError(error.message || 'Unable to remove this voucher. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  const term = search.trim().toLowerCase();
  const visible = vouchers.filter((voucher) =>
    String(voucher.code ?? '').toLowerCase().includes(term) ||
    String(voucher.name ?? '').toLowerCase().includes(term)
  );
  const expired = vouchers.filter((voucher) => voucher.expired).length;
  const available = vouchers.filter((voucher) => !voucher.expired && getRemainingUses(voucher) > 0).length;

  return (
    <AdminLayout activePage="vouchers" title="Vouchers | BRB Studios Admin">
      <main className="admin-main">
        <header className="page-header page-header--split">
          <div>
            <p className="page-header__eyebrow">Vouchers Management</p>
            <h1 className="page-header__title">Vouchers and Discounts</h1>
          </div>
          <button className="btn btn--primary btn--lg" type="button" onClick={() => openVoucherDialog()}>
            + Add Voucher
          </button>
        </header>

        <section className="voucher-stats" aria-label="Voucher summary">
          <article className="panel voucher-stat">
            <h2 className="voucher-stat__label">Total Vouchers</h2>
            <p className="voucher-stat__value">{loading ? '–' : vouchers.length}</p>
          </article>
          <article className="panel voucher-stat">
            <h2 className="voucher-stat__label">Available Vouchers</h2>
            <p className="voucher-stat__value">{loading ? '–' : available}</p>
          </article>
          <article className="panel voucher-stat">
            <h2 className="voucher-stat__label">Expired</h2>
            <p className="voucher-stat__value">{loading ? '–' : expired}</p>
          </article>
        </section>

        <section className="panel voucher-catalog" aria-labelledby="voucherCatalogTitle">
          <header className="voucher-catalog__header">
            <h2 className="voucher-catalog__title" id="voucherCatalogTitle">Vouchers and Discounts</h2>
            <label className="voucher-search">
              <span className="visually-hidden">Search vouchers</span>
              <span className="voucher-search__icon" aria-hidden="true"></span>
              <input
                className="field__input voucher-search__input"
                type="search"
                placeholder="Search code or name"
                autoComplete="off"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </header>

          {loading && <p className="status-message voucher-empty" role="status">Loading vouchers...</p>}
          {!loading && loadError && <p className="status-message voucher-empty" role="alert">{loadError}</p>}
          {!loading && !loadError && visible.length > 0 && (
            <div className="voucher-grid">
              {visible.map((voucher) => {
                const usageLimit = toCount(voucher.usageLimit);
                const usedCount = toCount(voucher.usedCount);
                const remainingUses = getRemainingUses(voucher);
                const usedPercent = usageLimit > 0 ? Math.min(100, (usedCount / usageLimit) * 100) : 0;
                return (
                  <article
                    key={voucher.id}
                    className={`panel voucher-card${voucher.expired ? ' voucher-card--expired' : ''}${!voucher.expired && remainingUses === 0 ? ' voucher-card--exhausted' : ''}`}
                  >
                    <header className="voucher-card__header">
                      <h3 className="voucher-card__code">{voucher.code}</h3>
                      <span className={`tag voucher-card__tag${voucher.expired ? ' tag--overdue' : !voucher.expired && remainingUses === 0 ? ' voucher-card__tag--exhausted' : ''}`}>
                        {voucher.expired ? 'Expired' : remainingUses === 0 ? 'Fully redeemed' : 'Active'}
                      </span>
                    </header>
                    <p className="voucher-card__value">{formatDiscount(voucher)}</p>
                    <p className="voucher-card__name">{voucher.name}</p>
                    <p className="voucher-card__period">{formatDate(voucher.startDate)} – {formatDate(voucher.endDate)}</p>
                    <section className="voucher-card__usage" aria-label="Voucher usage">
                      <div className="voucher-card__usage-label">
                        <span>Uses remaining</span>
                        <strong className="voucher-card__remaining">{remainingUses} / {usageLimit}</strong>
                      </div>
                      <div
                        className="voucher-card__meter"
                        role="progressbar"
                        aria-label="Voucher redemptions"
                        aria-valuemin={0}
                        aria-valuenow={Math.min(usageLimit, usedCount)}
                        aria-valuemax={usageLimit}
                        aria-valuetext={`${usedCount} of ${usageLimit} redemptions used`}
                      >
                        <span className="voucher-card__meter-fill" style={{ width: `${usedPercent}%` }}></span>
                      </div>
                      <p className="voucher-card__usage-note">
                        {usedCount} of {usageLimit} {usageLimit === 1 ? 'use' : 'uses'} redeemed
                      </p>
                    </section>
                    <footer className="voucher-card__footer">
                      <button className="btn btn--sm" type="button" aria-label={`Edit ${voucher.code}`} onClick={() => openVoucherDialog(voucher)}>
                        Edit
                      </button>
                      <button className="btn btn--sm btn--danger" type="button" aria-label={`Remove ${voucher.code}`} onClick={() => openDeleteDialog(voucher)}>
                        Remove
                      </button>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
          {!loading && !loadError && visible.length === 0 && (
            <p className="status-message voucher-empty" role="status">
              {vouchers.length === 0
                ? 'No vouchers yet. Click "+ Add Voucher" to create the first one.'
                : 'No vouchers match your search.'}
            </p>
          )}
        </section>
      </main>

      <Dialog open={voucherDialogOpen} labelledBy="voucherDialogTitle" onClose={closeVoucherDialog}>
        {voucherDialogOpen && (
          <form className="dialog__form" noValidate onSubmit={handleSubmit}>
            <h2 className="dialog__title" id="voucherDialogTitle">{editingVoucher ? 'Edit Voucher' : 'New Voucher'}</h2>
            {formError && <p className="alert alert--error" role="alert">{formError}</p>}

            <div className="voucher-form__row">
              <div className={`field${fieldErrors.code ? ' field--invalid' : ''}`}>
                <label className="field__label" htmlFor="voucherCode">Voucher Code</label>
                <input
                  className="field__input voucher-form__code"
                  id="voucherCode"
                  name="code"
                  type="text"
                  maxLength={30}
                  autoComplete="off"
                  required
                  value={formValues.code}
                  onChange={(event) => updateForm('code', event.target.value.toUpperCase())}
                />
                <FieldError>{fieldErrors.code}</FieldError>
              </div>
              <div className={`field${fieldErrors.name ? ' field--invalid' : ''}`}>
                <label className="field__label" htmlFor="voucherName">Voucher Name</label>
                <input
                  className="field__input"
                  id="voucherName"
                  name="name"
                  type="text"
                  maxLength={100}
                  autoComplete="off"
                  required
                  value={formValues.name}
                  onChange={(event) => updateForm('name', event.target.value)}
                />
                <FieldError>{fieldErrors.name}</FieldError>
              </div>
            </div>

            <div className="voucher-form__row">
              <div className={`field${fieldErrors.discountType ? ' field--invalid' : ''}`}>
                <label className="field__label" htmlFor="discountType">Discount Type</label>
                <select
                  className="field__input"
                  id="discountType"
                  name="discountType"
                  required
                  value={formValues.discountType}
                  onChange={(event) => updateForm('discountType', event.target.value)}
                >
                  <option value="Percentage">Percentage (%)</option>
                  <option value="Fixed">Fixed amount (₱)</option>
                </select>
                <FieldError>{fieldErrors.discountType}</FieldError>
              </div>
              <div className={`field${fieldErrors.discountValue ? ' field--invalid' : ''}`}>
                <label className="field__label" htmlFor="discountValue">Discount Value</label>
                <div className="input-group">
                  <span className="input-group__prefix" aria-hidden="true">
                    {formValues.discountType === 'Percentage' ? '%' : '₱'}
                  </span>
                  <input
                    className="field__input"
                    id="discountValue"
                    name="discountValue"
                    type="text"
                    inputMode="decimal"
                    required
                    value={formValues.discountValue}
                    onChange={(event) => updateForm('discountValue', event.target.value)}
                  />
                </div>
                <FieldError>{fieldErrors.discountValue}</FieldError>
              </div>
            </div>

            <div className="voucher-form__row">
              <div className={`field${fieldErrors.startDate ? ' field--invalid' : ''}`}>
                <label className="field__label" htmlFor="startDate">Start Date</label>
                <input
                  className="field__input"
                  id="startDate"
                  name="startDate"
                  type="date"
                  required
                  value={formValues.startDate}
                  onChange={(event) => updateForm('startDate', event.target.value)}
                />
                <FieldError>{fieldErrors.startDate}</FieldError>
              </div>
              <div className={`field${fieldErrors.endDate ? ' field--invalid' : ''}`}>
                <label className="field__label" htmlFor="endDate">End Date</label>
                <input
                  className="field__input"
                  id="endDate"
                  name="endDate"
                  type="date"
                  required
                  value={formValues.endDate}
                  onChange={(event) => updateForm('endDate', event.target.value)}
                />
                <FieldError>{fieldErrors.endDate}</FieldError>
              </div>
            </div>

            <div className={`field voucher-form__limit${fieldErrors.usageLimit ? ' field--invalid' : ''}`}>
              <label className="field__label" htmlFor="usageLimit">Usage Limit</label>
              <input
                className="field__input"
                id="usageLimit"
                name="usageLimit"
                type="text"
                inputMode="numeric"
                maxLength={4}
                required
                value={formValues.usageLimit}
                onChange={(event) => updateForm('usageLimit', event.target.value.replace(/\D/g, '').slice(0, 4))}
              />
              <p className="field__hint">Total redemptions allowed. This cannot be lower than the number already used.</p>
              <FieldError>{fieldErrors.usageLimit}</FieldError>
            </div>

            <div className="dialog__actions">
              <button className="btn" type="button" disabled={saving} onClick={closeVoucherDialog}>Cancel</button>
              <button className="btn btn--primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog open={deleteDialogOpen} labelledBy="deleteDialogTitle" onClose={() => { if (!deleting) setDeleteDialogOpen(false); }}>
        {deleteDialogOpen && (
          <div className="dialog__form">
            <h2 className="dialog__title" id="deleteDialogTitle">Remove voucher?</h2>
            <p className="dialog__text">
              &quot;{voucherToDelete?.code}&quot; will be permanently removed. Bookings that already used it keep their discount,
              but customers will no longer be able to enter this code.
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
