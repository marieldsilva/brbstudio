import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthField from '../components/AuthField.jsx';
import PageStyles from '../components/PageStyles.jsx';
import { getServerError, postJson } from '../lib/api.js';
import { LOGIN_PAGE_STYLES } from '../lib/pageStyles.js';

export default function LoginPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formNotice] = useState(
    new URLSearchParams(window.location.search).get('registered') === '1'
      ? 'Account created! You can now log in.'
      : '',
  );

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
    if (!values.email.trim()) localErrors.email = 'Email address is required.';
    if (!values.password) localErrors.password = 'Password is required.';
    if (Object.keys(localErrors).length) {
      setErrors(localErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await postJson('/api/auth/login', values);
      if (response.ok && typeof response.data?.redirectTo === 'string') {
        navigate(response.data.redirectTo, { replace: true });
        return;
      }

      const serverError = getServerError(response, ['email', 'password']);
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
        bodyClass="auth-page auth-page--login"
        stylesheets={LOGIN_PAGE_STYLES}
        title="Login | BRB Studios"
      />
      <main className="login">
        <section className="login__showcase">
          <img className="login__logo" src="/customer/CustomerImages/brb-logo.png" alt="BRB Studios" />
          <div className="login__gallery" role="img" aria-label="BRB Studios storefront">
            <img className="login__photo" src="/customer/CustomerImages/storefront-left.jpg" alt="" />
            <img className="login__photo" src="/customer/CustomerImages/storefront-center.jpg" alt="" />
            <img className="login__photo" src="/customer/CustomerImages/storefront-right.jpg" alt="" />
          </div>
        </section>

        <section className="login__panel">
          <h1 className="login__title">Welcome Back!</h1>
          <p className="login__subtitle">Sign in to manage your bookings</p>

          <p className="form-alert form-alert--success login__alert" role="status" hidden={!formNotice}>
            {formNotice}
          </p>
          <p className="form-alert form-alert--error login__alert" role="alert" hidden={!formError}>
            {formError}
          </p>

          <form className="auth-form login__form" id="loginForm" noValidate onSubmit={handleSubmit}>
            <AuthField id="email" label="Email Address" error={errors.email}>
              <input
                className="form-field__input"
                id="email"
                name="email"
                type="email"
                placeholder="juandelacruz67@gmail.com"
                autoComplete="email"
                value={values.email}
                onChange={handleChange}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'emailError' : undefined}
                required
              />
            </AuthField>

            <AuthField id="password" label="Password" error={errors.password}>
              <div className="password-input">
                <input
                  className="form-field__input"
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="***********"
                  autoComplete="current-password"
                  value={values.password}
                  onChange={handleChange}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'passwordError' : undefined}
                  required
                />
                <button
                  className={`password-input__toggle${showPassword ? ' is-visible' : ''}`}
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  <span className="password-input__icon" aria-hidden="true"></span>
                </button>
              </div>
            </AuthField>

            <button className="btn-primary btn-primary--block login__submit" type="submit" disabled={isSubmitting}>
              Login
            </button>
          </form>

          <p className="login__register">
            No account yet? <Link className="auth-link" to="/customer/html/register.html">Register</Link>
          </p>
          <Link className="login__back" to="/customer/html/home.html">back to home</Link>
        </section>
      </main>
    </>
  );
}
