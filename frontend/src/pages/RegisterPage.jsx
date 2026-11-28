import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthField from '../components/AuthField.jsx';
import PageStyles from '../components/PageStyles.jsx';
import { getServerError, postJson } from '../lib/api.js';
import { REGISTER_PAGE_STYLES } from '../lib/pageStyles.js';

const REQUIRED_MESSAGES = {
  firstName: 'First name is required.',
  lastName: 'Last name is required.',
  email: 'Email address is required.',
  contactNumber: 'Contact number is required.',
  password: 'Password is required.',
  confirmPassword: 'Please confirm your password.',
};

const FIELD_NAMES = Object.keys(REQUIRED_MESSAGES);

export default function RegisterPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState({
    firstName: '',
    lastName: '',
    email: '',
    contactNumber: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: '' }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});
    setFormError('');

    const localErrors = {};
    Object.entries(REQUIRED_MESSAGES).forEach(([name, message]) => {
      if (!values[name].trim()) localErrors[name] = message;
    });
    if (!localErrors.password && !localErrors.confirmPassword && values.password !== values.confirmPassword) {
      localErrors.confirmPassword = 'Passwords do not match. Please re-enter your password.';
    }
    if (Object.keys(localErrors).length) {
      setErrors(localErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await postJson('/api/auth/register', values);
      if (response.ok && typeof response.data?.redirectTo === 'string') {
        navigate(response.data.redirectTo, { replace: true });
        return;
      }

      const serverError = getServerError(response, FIELD_NAMES);
      setErrors(serverError.fieldErrors);
      setFormError(serverError.message);
    } catch {
      setFormError('Unable to reach the server. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <PageStyles
        bodyClass="auth-page auth-page--register"
        stylesheets={REGISTER_PAGE_STYLES}
        title="Create Account | BRB Studios"
      />
      <main className="register">
        <img className="register__logo" src="/customer/CustomerImages/brb-logo.png" alt="BRB Studios" />
        <h1 className="register__title">Create your account</h1>

        <p className="form-alert form-alert--error" role="alert" hidden={!formError}>{formError}</p>

        <form className="auth-form register__form" id="registerForm" noValidate onSubmit={handleSubmit}>
          <div className="register__row">
            <AuthField id="firstName" label="First Name" error={errors.firstName}>
              <input
                className="form-field__input"
                id="firstName"
                name="firstName"
                type="text"
                placeholder="Juan"
                autoComplete="given-name"
                maxLength={50}
                value={values.firstName}
                onChange={handleChange}
                aria-invalid={Boolean(errors.firstName)}
                aria-describedby={errors.firstName ? 'firstNameError' : undefined}
                required
              />
            </AuthField>
            <AuthField id="lastName" label="Last Name" error={errors.lastName}>
              <input
                className="form-field__input"
                id="lastName"
                name="lastName"
                type="text"
                placeholder="Dela Cruz"
                autoComplete="family-name"
                maxLength={50}
                value={values.lastName}
                onChange={handleChange}
                aria-invalid={Boolean(errors.lastName)}
                aria-describedby={errors.lastName ? 'lastNameError' : undefined}
                required
              />
            </AuthField>
          </div>

          <AuthField id="email" label="Email Address" error={errors.email}>
            <input
              className="form-field__input"
              id="email"
              name="email"
              type="email"
              placeholder="juandelacruz67@gmail.com"
              autoComplete="email"
              maxLength={100}
              value={values.email}
              onChange={handleChange}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'emailError' : undefined}
              required
            />
          </AuthField>

          <AuthField id="contactNumber" label="Contact Number" error={errors.contactNumber}>
            <input
              className="form-field__input"
              id="contactNumber"
              name="contactNumber"
              type="tel"
              placeholder="09XXXXXXXXX"
              autoComplete="tel"
              inputMode="numeric"
              maxLength={11}
              value={values.contactNumber}
              onChange={handleChange}
              aria-invalid={Boolean(errors.contactNumber)}
              aria-describedby={errors.contactNumber ? 'contactNumberError' : undefined}
              required
            />
          </AuthField>

          <div className="register__row">
            <AuthField id="password" label="Password" error={errors.password}>
              <input
                className="form-field__input"
                id="password"
                name="password"
                type="password"
                placeholder="***********"
                autoComplete="new-password"
                maxLength={72}
                value={values.password}
                onChange={handleChange}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'passwordError' : undefined}
                required
              />
            </AuthField>
            <AuthField id="confirmPassword" label="Confirm Password" error={errors.confirmPassword}>
              <input
                className="form-field__input"
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="***********"
                autoComplete="new-password"
                maxLength={72}
                value={values.confirmPassword}
                onChange={handleChange}
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby={errors.confirmPassword ? 'confirmPasswordError' : undefined}
                required
              />
            </AuthField>
          </div>

          <button className="btn-primary register__submit" type="submit" disabled={isSubmitting}>
            Create Account
          </button>
        </form>

        <p className="register__footer">
          Already have an account? <Link className="auth-link" to="/customer/html/login.html">Login</Link>
        </p>
      </main>
    </>
  );
}
