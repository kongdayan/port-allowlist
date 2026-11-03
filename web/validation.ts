import { errorText, translate, type Locale } from './i18n';
// Keep native constraint-validation messages in the selected application language.
export function installValidation(locale: Locale) {
  const eligible = (
    target: EventTarget | null,
  ): target is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement;
  const reset = (event: Event) => {
    if (eligible(event.target)) event.target.setCustomValidity('');
  };
  const invalid = (event: Event) => {
    if (!eligible(event.target)) return;
    const field = event.target,
      validity = field.validity;
    let message = translate(locale, 'invalidValue');
    if (validity.valueMissing) message = translate(locale, 'requiredValue');
    else if (
      field instanceof HTMLInputElement &&
      (validity.rangeOverflow || validity.rangeUnderflow || validity.stepMismatch)
    ) {
      message =
        field.type === 'date'
          ? translate(locale, 'dateRange', { min: field.min, max: field.max })
          : errorText(locale, 'NUMBER_OUT_OF_RANGE', { min: field.min, max: field.max });
    }
    field.setCustomValidity(message);
  };
  document.querySelectorAll('input,select,textarea').forEach((field) => {
    if (eligible(field)) field.setCustomValidity('');
  });
  document.addEventListener('invalid', invalid, true);
  document.addEventListener('input', reset, true);
  document.addEventListener('change', reset, true);
  return () => {
    document.removeEventListener('invalid', invalid, true);
    document.removeEventListener('input', reset, true);
    document.removeEventListener('change', reset, true);
  };
}
