const SESSION_KEY = "luj.session.v1";
const LOCALE_KEY = "luj.locale.v1";

export function setSessionEmail(email: string) {
  window.localStorage.setItem(SESSION_KEY, email);
}

export function getSessionEmail() {
  return window.localStorage.getItem(SESSION_KEY);
}

export function logoutUser() {
  window.localStorage.removeItem(SESSION_KEY);
}

export function getStoredLocale() {
  const raw = window.localStorage.getItem(LOCALE_KEY);
  return raw === "zh" ? "zh" : "en";
}

export function setStoredLocale(locale: "en" | "zh") {
  window.localStorage.setItem(LOCALE_KEY, locale);
}
