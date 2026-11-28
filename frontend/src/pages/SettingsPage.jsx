import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AccountLayout from '../components/AccountLayout.jsx';
import AuthField from '../components/AuthField.jsx';
import { getJson, getServerError, postJson, putJson } from '../lib/api.js';

const EMPTY_PROFILE = {
  firstName: '',
  lastName: '',
  email: '',
  contactNumber: '',
};

const EMPTY_PASSWORDS = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const [isLoading, setIsLoading] = useState(true);
  const [profileErrors, setProfileErrors] = useState({});
  const [passwordErrors, setPasswordErrors] = useState({});
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const session = await getJson('/api/auth/me');
        if (!session.ok || !session.data?.customer) {
          navigate('/customer/html/login.html', { replace: true });
          return;
        }
        if (cancelled) return;
        setCustomer(session.data.customer);

        const response = await getJson('/api/customer/profile');
        if (!response.ok) {
          if (response.status === 401) {
            navigate('/customer/html/login.html', { replace: true });
            return;
          }
          throw new Error(response.data?.message || 'Unable to load your profile. Please try again.');
        }

        const currentProfile = response.data?.profile;
        if (!currentProfile || typeof currentProfile !== 'object') {
          throw new Error('The server returned an invalid profile response.');
        }

        if (!cancelled) {
          setProfile({
            firstName: currentProfile.firstName ?? '',
            lastName: currentProfile.lastName ?? '',
            email: currentProfile.email ?? '',
            contactNumber: currentProfile.contactNumber ?? '',
          });
        }
      } catch (error) {
        if (!cancelled) {
          setProfileError(error instanceof Error
            ? error.message
            : 'Unable to load your profile. Please try again.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  function handleProfileChange(event) {
    const { name, value } = event.target;
    setProfile((current) => ({ ...current, [name]: value }));
    setProfileErrors((current) => ({ ...current, [name]: '' }));
  }

  function handlePasswordChange(event) {
    const { name, value } = event.target;
    setPasswords((current) => ({ ...current, [name]: value }));
    setPasswordErrors((current) => ({ ...current, [name]: '' }));
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setProfileErrors({});
    setProfileError('');
    setProfileSuccess('');

    const localErrors = {};
    if (!profile.firstName.trim()) localErrors.firstName = 'First name is required.';
    if (!profile.lastName.trim()) localErrors.lastName = 'Last name is required.';
    if (!profile.email.trim()) localErrors.email = 'Email address is required.';
    if (!profile.contactNumber.trim()) localErrors.contactNumber = 'Contact number is required.';
    if (Object.keys(localErrors).length) {
      setProfileErrors(localErrors);
      return;
    }

    setSavingProfile(true);
    try {
      const response = await putJson('/api/customer/profile', profile);
      if (response.ok) {
        const savedProfile = response.data?.profile ?? profile;
        setProfile((current) => ({ ...current, ...savedProfile }));
        setCustomer((current) => ({ ...current, ...savedProfile }));
        setProfileSuccess('Changes saved successfully.');
      } else {
        const serverError = getServerError(response, Object.keys(EMPTY_PROFILE));
        setProfileErrors(serverError.fieldErrors);
        setProfileError(serverError.message);
      }
    } catch {
      setProfileError('Unable to reach the server. Please check your connection and try again.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setPasswordErrors({});
    setPasswordError('');
    setPasswordSuccess('');

    const localErrors = {};
    if (!passwords.currentPassword) localErrors.currentPassword = 'Current password is required.';
    if (!passwords.newPassword) localErrors.newPassword = 'New password is required.';
    if (!passwords.confirmPassword) localErrors.confirmPassword = 'Please confirm your new password.';
    if (!localErrors.newPassword && !localErrors.confirmPassword && passwords.newPassword !== passwords.confirmPassword) {
      localErrors.confirmPassword = 'Passwords do not match.';
    }
    if (Object.keys(localErrors).length) {
      setPasswordErrors(localErrors);
      return;
    }

    setSavingPassword(true);
    try {
      const response = await postJson('/api/customer/profile/password', passwords);
      if (response.ok) {
        setPasswords(EMPTY_PASSWORDS);
        setPasswordSuccess('Password updated successfully.');
      } else {
        const serverError = getServerError(response, Object.keys(EMPTY_PASSWORDS));
        setPasswordErrors(serverError.fieldErrors);
        setPasswordError(serverError.message);
      }
    } catch {
      setPasswordError('Unable to reach the server. Please check your connection and try again.');
    } finally {
      setSavingPassword(false);
    }
  }

  const displayName = `${profile.firstName} ${profile.lastName}`.trim()
    || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ');

  return (
    <AccountLayout
      activePage="settings"
      customer={customer}
      title="Settings | BRB Studios"
    >
      <section className="settings">
        <h1 className="settings__display-name">{displayName}</h1>

        {isLoading && <p role="status">Loading your profile...</p>}
        <p className="form-alert form-alert--success settings__alert" role="status" hidden={!profileSuccess}>
          {profileSuccess}
        </p>
        <p className="form-alert form-alert--error settings__alert" role="alert" hidden={!profileError}>
          {profileError}
        </p>

        <form className="settings__form" id="profileForm" noValidate onSubmit={handleProfileSubmit}>
          <div className="settings__row">
            <AuthField id="firstName" label="First Name" error={profileErrors.firstName}>
              <input
                className="form-field__input"
                id="firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                maxLength={50}
                value={profile.firstName}
                onChange={handleProfileChange}
                disabled={isLoading || savingProfile}
                aria-invalid={Boolean(profileErrors.firstName)}
                aria-describedby={profileErrors.firstName ? 'firstNameError' : undefined}
                required
              />
            </AuthField>
            <AuthField id="lastName" label="Last Name" error={profileErrors.lastName}>
              <input
                className="form-field__input"
                id="lastName"
                name="lastName"
                type="text"
                autoComplete="family-name"
                maxLength={50}
                value={profile.lastName}
                onChange={handleProfileChange}
                disabled={isLoading || savingProfile}
                aria-invalid={Boolean(profileErrors.lastName)}
                aria-describedby={profileErrors.lastName ? 'lastNameError' : undefined}
                required
              />
            </AuthField>
          </div>

          <div className="settings__row">
            <AuthField id="email" label="Email Address" error={profileErrors.email}>
              <input
                className="form-field__input"
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={100}
                value={profile.email}
                onChange={handleProfileChange}
                disabled={isLoading || savingProfile}
                aria-invalid={Boolean(profileErrors.email)}
                aria-describedby={profileErrors.email ? 'emailError' : undefined}
                required
              />
            </AuthField>
            <AuthField id="contactNumber" label="Contact Number" error={profileErrors.contactNumber}>
              <input
                className="form-field__input"
                id="contactNumber"
                name="contactNumber"
                type="tel"
                autoComplete="tel"
                inputMode="numeric"
                maxLength={11}
                value={profile.contactNumber}
                onChange={handleProfileChange}
                disabled={isLoading || savingProfile}
                aria-invalid={Boolean(profileErrors.contactNumber)}
                aria-describedby={profileErrors.contactNumber ? 'contactNumberError' : undefined}
                required
              />
            </AuthField>
          </div>

          <div className="settings__footer">
            <button className="btn-primary" id="saveProfile" type="submit" disabled={isLoading || savingProfile}>
              Save Changes
            </button>
          </div>
        </form>

        <section className="change-password" aria-labelledby="passwordHeading">
          <h2 className="change-password__title" id="passwordHeading">Change Password</h2>

          <p className="form-alert form-alert--success" role="status" hidden={!passwordSuccess}>
            {passwordSuccess}
          </p>
          <p className="form-alert form-alert--error" role="alert" hidden={!passwordError}>
            {passwordError}
          </p>

          <form className="change-password__form" id="passwordForm" noValidate onSubmit={handlePasswordSubmit}>
            <div className="change-password__row">
              <AuthField id="currentPassword" label="Current" error={passwordErrors.currentPassword}>
                <input
                  className="form-field__input"
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  placeholder="***********"
                  autoComplete="current-password"
                  maxLength={72}
                  value={passwords.currentPassword}
                  onChange={handlePasswordChange}
                  aria-invalid={Boolean(passwordErrors.currentPassword)}
                  aria-describedby={passwordErrors.currentPassword ? 'currentPasswordError' : undefined}
                  required
                />
              </AuthField>
              <AuthField id="newPassword" label="New" error={passwordErrors.newPassword}>
                <input
                  className="form-field__input"
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  placeholder="***********"
                  autoComplete="new-password"
                  maxLength={72}
                  value={passwords.newPassword}
                  onChange={handlePasswordChange}
                  aria-invalid={Boolean(passwordErrors.newPassword)}
                  aria-describedby={passwordErrors.newPassword ? 'newPasswordError' : undefined}
                  required
                />
              </AuthField>
              <AuthField id="confirmPassword" label="Confirm" error={passwordErrors.confirmPassword}>
                <input
                  className="form-field__input"
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="***********"
                  autoComplete="new-password"
                  maxLength={72}
                  value={passwords.confirmPassword}
                  onChange={handlePasswordChange}
                  aria-invalid={Boolean(passwordErrors.confirmPassword)}
                  aria-describedby={passwordErrors.confirmPassword ? 'confirmPasswordError' : undefined}
                  required
                />
              </AuthField>
            </div>
            <button className="btn-primary" id="updatePassword" type="submit" disabled={savingPassword}>
              Update Password
            </button>
          </form>
        </section>
      </section>
    </AccountLayout>
  );
}
