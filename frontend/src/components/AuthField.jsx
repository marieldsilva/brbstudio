export default function AuthField({ id, label, error, children }) {
  return (
    <div className={`form-field${error ? ' form-field--invalid' : ''}`}>
      <label className="form-field__label" htmlFor={id}>{label}</label>
      {children}
      <p className="form-field__error" id={`${id}Error`} hidden={!error}>
        {error || ''}
      </p>
    </div>
  );
}
