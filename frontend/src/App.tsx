import { FormEvent, useEffect, useRef, useState } from "react";

import {
  addBadge,
  addDomain,
  createPath,
  deleteBadge,
  deleteDomain,
  deletePath,
  fetchPaths,
  loginAccount,
  processActionLog,
  registerAccount,
  updateAccount,
  updateBadge,
  updateDomain,
  updatePassword,
} from "./lib/api";
import {
  getSessionEmail,
  getStoredLocale,
  logoutUser,
  setSessionEmail as persistSessionEmail,
  setStoredLocale,
} from "./lib/auth";
import { text } from "./lib/i18n";
import { getLevelProgress, getMilestones, getRankTitle } from "./lib/leveling";
import { exportPathPdf } from "./lib/pdf";
import type {
  ActionLogResponse,
  Badge,
  BadgeTier,
  BadgeType,
  Domain,
  DomainProficiencyRating,
  Locale,
  PathRecord,
} from "./types";

type AuthMode = "login" | "register";

const proficiencyOptions: DomainProficiencyRating[] = [
  "Initiate",
  "Apprentice",
  "Practitioner",
  "Specialist",
  "Expert",
  "Master",
];

const proficiencyLabels: Record<Locale, Record<DomainProficiencyRating, string>> = {
  en: {
    Initiate: "Initiate",
    Apprentice: "Apprentice",
    Practitioner: "Practitioner",
    Specialist: "Specialist",
    Expert: "Expert",
    Master: "Master",
  },
  zh: {
    Initiate: "入門者",
    Apprentice: "學徒",
    Practitioner: "實作者",
    Specialist: "專精者",
    Expert: "專家",
    Master: "大師",
  },
};

const badgeTiers: BadgeTier[] = ["bronze", "silver", "gold"];
const BADGES_PER_PAGE = 3;

function randomBadgeTier(): BadgeTier {
  return badgeTiers[Math.floor(Math.random() * badgeTiers.length)] ?? "bronze";
}

function getBadgeAssetPath(type: BadgeType, tier: BadgeTier) {
  return `/badges/${type}-${tier}.png`;
}

function getProficiencyLabel(
  rating: DomainProficiencyRating,
  locale: Locale,
) {
  return proficiencyLabels[locale][rating];
}

function getPathMonogram(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return "P";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function Modal({
  children,
  onClose,
  className,
}: {
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={className ? `modal-shell ${className}` : "modal-shell"} onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} type="button" aria-label="close">
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

function App() {
  const levelTrackScrollRef = useRef<HTMLDivElement | null>(null);
  const [locale, setLocale] = useState<Locale>(getStoredLocale());
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [sessionEmail, setSessionEmail] = useState<string | null>(getSessionEmail());
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [paths, setPaths] = useState<PathRecord[]>([]);
  const [selectedPathId, setSelectedPathId] = useState<number | null>(null);
  const [loadingPaths, setLoadingPaths] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createPathOpen, setCreatePathOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [pathBusy, setPathBusy] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState<"email" | "password" | null>(null);
  const [settingsEditor, setSettingsEditor] = useState<"email" | "password" | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");

  const [pathForm, setPathForm] = useState({
    route_name: "",
    current_status: "",
    past_achievements: "",
  });
  const [actionLog, setActionLog] = useState("");
  const [lastActionUpdate, setLastActionUpdate] = useState<ActionLogResponse | null>(null);
  const [actionResultOpen, setActionResultOpen] = useState(false);
  const [levelTrackOpen, setLevelTrackOpen] = useState(false);
  const [accountForm, setAccountForm] = useState({
    current_password: "",
    new_email: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  const [badgeModal, setBadgeModal] = useState<{
    badge: Badge | null;
    pathId: number | null;
    mode: "create" | "edit";
  }>({ badge: null, pathId: null, mode: "create" });
  const [badgeForm, setBadgeForm] = useState({
    name: "",
    type: "achievement" as BadgeType,
    tier: randomBadgeTier() as BadgeTier,
    progress: 0,
    reason: "",
  });
  const [badgeVisibility, setBadgeVisibility] = useState<"pending" | "completed">("pending");
  const [badgePage, setBadgePage] = useState(0);

  const [domainModal, setDomainModal] = useState<{
    domain: Domain | null;
    pathId: number | null;
    mode: "create" | "edit";
  }>({ domain: null, pathId: null, mode: "create" });
  const [domainForm, setDomainForm] = useState({
    name: "",
    summary: "",
    proficiency_rating: "Initiate" as DomainProficiencyRating,
    proficiency_reason: "",
  });

  const [pendingDeletePath, setPendingDeletePath] = useState<PathRecord | null>(null);

  const t = (key: Parameters<typeof text>[1]) => text(locale, key);
  const selectedPath = paths.find((entry) => entry.path.id === selectedPathId) ?? null;
  const progressWidth = selectedPath
    ? getLevelProgress(selectedPath.path.level, selectedPath.path.total_exp)
    : 0;
  const visibleBadges = selectedPath
    ? selectedPath.badges
        .filter((badge) => (badgeVisibility === "completed" ? badge.is_completed : !badge.is_completed))
        .sort((left, right) => {
          if (badgeVisibility === "pending") {
            return right.progress - left.progress;
          }
          return left.name.localeCompare(right.name);
        })
    : [];
  const badgePageCount = Math.max(1, Math.ceil(visibleBadges.length / BADGES_PER_PAGE));
  const currentBadgePage = Math.min(badgePage, badgePageCount - 1);
  const pagedBadges = visibleBadges.slice(
    currentBadgePage * BADGES_PER_PAGE,
    currentBadgePage * BADGES_PER_PAGE + BADGES_PER_PAGE,
  );
  const busyLabel = locale === "zh" ? "AI 正在處理..." : "AI is processing...";
  const creatingLabel = locale === "zh" ? "AI 正在建立路線..." : "AI is building the path...";
  const syncingLabel = locale === "zh" ? "AI 正在同步資料..." : "AI is syncing data...";
  const levelTrack = Array.from({ length: 100 }, (_, index) => {
    const level = index + 1;
    const milestone = level === 1 || level % 10 === 0;
    return {
      level,
      title: milestone ? getRankTitle(level, locale) : "",
      milestone,
    };
  });
  const milestoneLevels = getMilestones(locale);
  useEffect(() => {
    setStoredLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (!sessionEmail) return;
    setAccountForm({ current_password: "", new_email: sessionEmail });
    setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
  }, [sessionEmail]);

  useEffect(() => {
    setBadgePage(0);
  }, [selectedPathId, badgeVisibility]);

  useEffect(() => {
    if (!levelTrackOpen || !selectedPath) return;
    const frame = window.requestAnimationFrame(() => {
      const trackRoot = levelTrackScrollRef.current;
      const currentNode = trackRoot?.querySelector<HTMLElement>("[data-current-level='true']");
      currentNode?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [levelTrackOpen, selectedPath]);

  useEffect(() => {
    if (!sessionEmail) return;
    void loadPaths();
  }, [sessionEmail]);

  function handleUnauthorizedSession() {
    logoutUser();
    setSessionEmail(null);
    setPaths([]);
    setSelectedPathId(null);
    setSettingsOpen(false);
    setRequestError(locale === "zh" ? "登入狀態已失效，請重新登入。" : "Your session expired. Please sign in again.");
  }

  function resolveRequestError(error: unknown) {
    const message = error instanceof Error ? error.message : t("backendError");
    if (message === "Account not found." || message === "Missing user session.") {
      handleUnauthorizedSession();
      return null;
    }
    return message;
  }

  async function loadPaths() {
    setLoadingPaths(true);
    setRequestError("");

    try {
      const data = await fetchPaths();
      setPaths(data.paths);
      setSelectedPathId((current) => {
        if (!data.paths.length) return null;
        if (current && data.paths.some((item) => item.path.id === current)) return current;
        return data.paths[0].path.id;
      });
    } catch (error) {
      const message = resolveRequestError(error);
      if (message) setRequestError(message);
    } finally {
      setLoadingPaths(false);
    }
  }

  function resetBadgeModal() {
    setBadgeModal({ badge: null, pathId: null, mode: "create" });
    setBadgeForm({ name: "", type: "achievement", tier: randomBadgeTier(), progress: 0, reason: "" });
  }

  function resetDomainModal() {
    setDomainModal({ domain: null, pathId: null, mode: "create" });
    setDomainForm({
      name: "",
      summary: "",
      proficiency_rating: "Initiate",
      proficiency_reason: "",
    });
  }

  function openBadgeView(pathId: number, badge: Badge) {
    setBadgeModal({ badge, pathId, mode: "edit" });
    setBadgeForm({
      name: badge.name,
      type: badge.type,
      tier: badge.tier,
      progress: badge.progress,
      reason: badge.reason,
    });
  }

  function openBadgeCreate(pathId: number) {
    setBadgeModal({ badge: null, pathId, mode: "create" });
    setBadgeForm({ name: "", type: "achievement", tier: randomBadgeTier(), progress: 0, reason: "" });
  }

  function openDomainView(pathId: number, domain: Domain) {
    setDomainModal({ domain, pathId, mode: "edit" });
    setDomainForm({
      name: domain.name,
      summary: domain.summary,
      proficiency_rating: domain.proficiency_rating,
      proficiency_reason: domain.proficiency_reason,
    });
  }

  function openDomainCreate(pathId: number) {
    setDomainModal({ domain: null, pathId, mode: "create" });
    setDomainForm({
      name: "",
      summary: "",
      proficiency_rating: "Initiate",
      proficiency_reason: "",
    });
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setAuthBusy(true);

    try {
      const email = authForm.email.trim();
      const password = authForm.password;
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailPattern.test(email)) throw new Error("Please enter a valid email address.");
      if (password.length < 6) throw new Error("Password must be at least 6 characters.");

      if (authMode === "register") {
        if (password !== authForm.confirmPassword) throw new Error("Passwords do not match.");
        const session = await registerAccount({ email, password });
        persistSessionEmail(session.email);
        setSessionEmail(session.email);
      } else {
        const session = await loginAccount({ email, password });
        persistSessionEmail(session.email);
        setSessionEmail(session.email);
      }
      setAuthForm({ email: "", password: "", confirmPassword: "" });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleCreatePath(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPathBusy(true);
    setRequestError("");

    try {
      await createPath({ ...pathForm, lang: locale });
      setCreatePathOpen(false);
      setPathForm({ route_name: "", current_status: "", past_achievements: "" });
      await loadPaths();
    } catch (error) {
      const message = resolveRequestError(error);
      if (message) setRequestError(message);
    } finally {
      setPathBusy(false);
    }
  }

  async function handleActionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionLog.trim()) return;

    setActionBusy(true);
    setRequestError("");

    try {
      const result = await processActionLog({ action_log: actionLog, lang: locale });
      setLastActionUpdate(result);
      setActionResultOpen(true);
      setActionLog("");
      await loadPaths();
    } catch (error) {
      const message = resolveRequestError(error);
      if (message) setRequestError(message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDeletePath() {
    if (!pendingDeletePath) return;
    setEditorBusy(true);
    try {
      await deletePath(pendingDeletePath.path.id);
      setPendingDeletePath(null);
      await loadPaths();
    } catch (error) {
      const message = resolveRequestError(error);
      if (message) setRequestError(message);
    } finally {
      setEditorBusy(false);
    }
  }

  async function handleBadgeSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!badgeModal.pathId) return;

    setEditorBusy(true);
    try {
      if (badgeModal.mode === "create") {
        await addBadge(badgeModal.pathId, badgeForm);
      } else if (badgeModal.mode === "edit" && badgeModal.badge) {
        await updateBadge(badgeModal.badge.id, badgeForm);
      }
      resetBadgeModal();
      await loadPaths();
    } catch (error) {
      const message = resolveRequestError(error);
      if (message) setRequestError(message);
    } finally {
      setEditorBusy(false);
    }
  }

  async function handleBadgeDelete() {
    if (!badgeModal.badge) return;
    setEditorBusy(true);
    try {
      await deleteBadge(badgeModal.badge.id);
      resetBadgeModal();
      await loadPaths();
    } catch (error) {
      const message = resolveRequestError(error);
      if (message) setRequestError(message);
    } finally {
      setEditorBusy(false);
    }
  }

  async function handleDomainSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!domainModal.pathId) return;

    setEditorBusy(true);
    try {
      if (domainModal.mode === "create") {
        await addDomain(domainModal.pathId, domainForm);
      } else if (domainModal.mode === "edit" && domainModal.domain) {
        await updateDomain(domainModal.domain.id, domainForm);
      }
      resetDomainModal();
      await loadPaths();
    } catch (error) {
      const message = resolveRequestError(error);
      if (message) setRequestError(message);
    } finally {
      setEditorBusy(false);
    }
  }

  async function handleDomainDelete() {
    if (!domainModal.domain) return;
    setEditorBusy(true);
    try {
      await deleteDomain(domainModal.domain.id);
      resetDomainModal();
      await loadPaths();
    } catch (error) {
      const message = resolveRequestError(error);
      if (message) setRequestError(message);
    } finally {
      setEditorBusy(false);
    }
  }

  function handleLogout() {
    logoutUser();
    setSessionEmail(null);
    setPaths([]);
    setSelectedPathId(null);
    setSettingsOpen(false);
    setSettingsError("");
    setSettingsMessage("");
  }

  async function handleAccountUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionEmail) return;

    setSettingsBusy("email");
    setSettingsError("");
    setSettingsMessage("");

    try {
      const response = await updateAccount({
        current_email: sessionEmail,
        current_password: accountForm.current_password,
        new_email: accountForm.new_email.trim(),
      });
      persistSessionEmail(response.email);
      setSessionEmail(response.email);
      setAccountForm({ current_password: "", new_email: response.email });
      setSettingsMessage(t("emailUpdated"));
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : t("backendError"));
    } finally {
      setSettingsBusy(null);
    }
  }

  async function handlePasswordUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionEmail) return;
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setSettingsError(locale === "zh" ? "新密碼與確認密碼不一致。" : "New passwords do not match.");
      return;
    }

    setSettingsBusy("password");
    setSettingsError("");
    setSettingsMessage("");

    try {
      await updatePassword({
        email: sessionEmail,
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      setSettingsMessage(t("passwordUpdated"));
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : t("backendError"));
    } finally {
      setSettingsBusy(null);
    }
  }

  async function handleSharePath() {
    if (!selectedPath || shareBusy) return;
    setShareBusy(true);
    setRequestError("");

    try {
      await exportPathPdf({
        locale,
        pathRecord: selectedPath,
        rankTitle: getRankTitle(selectedPath.path.level, locale),
        proficiencyLabel: (rating) => getProficiencyLabel(rating, locale),
      });
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : t("shareFailed"));
    } finally {
      setShareBusy(false);
    }
  }

  if (!sessionEmail) {
    return (
      <div className="auth-page">
        <div className="auth-atmosphere" />
        <section className="auth-panel auth-copy">
          <span className="auth-kicker">{t("authKicker")}</span>
          <h1>{t("brand")}</h1>
          <p className="auth-headline">{t("authTitle")}</p>
          <p className="auth-body">{t("authBody")}</p>
          <div className="auth-language-row">
            <button
              className={locale === "en" ? "language-pill active" : "language-pill"}
              onClick={() => setLocale("en")}
              type="button"
            >
              {t("english")}
            </button>
            <button
              className={locale === "zh" ? "language-pill active" : "language-pill"}
              onClick={() => setLocale("zh")}
              type="button"
            >
              {t("chinese")}
            </button>
          </div>
        </section>

        <section className="auth-panel auth-form-shell">
          <div className="auth-tabs">
            <button
              className={authMode === "login" ? "auth-tab active" : "auth-tab"}
              onClick={() => setAuthMode("login")}
              type="button"
            >
              {t("login")}
            </button>
            <button
              className={authMode === "register" ? "auth-tab active" : "auth-tab"}
              onClick={() => setAuthMode("register")}
              type="button"
            >
              {t("register")}
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <label className="field">
              <span>{t("email")}</span>
              <input
                autoComplete="email"
                type="email"
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm((current) => ({ ...current, email: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>{t("password")}</span>
              <input
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                type="password"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm((current) => ({ ...current, password: event.target.value }))
                }
              />
            </label>
            {authMode === "register" ? (
              <label className="field">
                <span>{t("confirmPassword")}</span>
                <input
                  autoComplete="new-password"
                  type="password"
                  value={authForm.confirmPassword}
                  onChange={(event) =>
                    setAuthForm((current) => ({
                      ...current,
                      confirmPassword: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}
            {authError ? <p className="error-text">{authError}</p> : null}
            <button className="primary-button auth-submit" disabled={authBusy} type="submit">
              {authMode === "login" ? t("continue") : t("createAccount")}
            </button>
          </form>
          <p className="auth-footnote">{t("authFootnote")}</p>
        </section>
      </div>
    );
  }

  return (
    <div className={sidebarCollapsed ? "dashboard-page sidebar-collapsed" : "dashboard-page"}>
      <div className="dashboard-glow dashboard-glow-left" />
      <div className="dashboard-glow dashboard-glow-right" />

      <header className="app-topbar">
        <div className="brand-lockup">
          <span className="topbar-kicker">{t("dashboard")}</span>
          <div className="brand-line">
            <h1>{t("brand")}</h1>
          </div>
        </div>

        <div className="topbar-actions">
          <button
            className={shareBusy ? "share-trigger busy" : "share-trigger"}
            type="button"
            aria-label={shareBusy ? t("sharePreparing") : t("share")}
            title={shareBusy ? t("sharePreparing") : t("share")}
            onClick={handleSharePath}
            disabled={!selectedPath || shareBusy}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path
                d="M12 3l4 4h-3v7h-2V7H8l4-4zm-7 11h2v4h10v-4h2v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5z"
                fill="currentColor"
              />
            </svg>
            <span>{t("share")}</span>
          </button>
          <button
            className="settings-trigger"
            onClick={() => {
              setSettingsError("");
              setSettingsMessage("");
              setSettingsEditor(null);
              setSettingsOpen(true);
            }}
            type="button"
            aria-label={t("settings")}
            title={t("settings")}
          >
            <span className="settings-trigger-mark">•••</span>
          </button>
        </div>
      </header>

      <div className="dashboard-shell">
        <aside className={sidebarCollapsed ? "sidebar collapsed" : "sidebar"}>
          <div className="sidebar-header">
            {!sidebarCollapsed ? <span className="sidebar-subtitle">{t("sidebarTitle")}</span> : null}
            <button
              className={sidebarCollapsed ? "icon-button sidebar-toggle compact" : "icon-button sidebar-toggle"}
              onClick={() => setSidebarCollapsed((current) => !current)}
              type="button"
              aria-label={sidebarCollapsed ? t("expand") : t("collapse")}
            >
              {sidebarCollapsed ? "»" : "«"}
            </button>
          </div>

          <button
            className={sidebarCollapsed ? "primary-button sidebar-create compact" : "primary-button sidebar-create"}
            onClick={() => setCreatePathOpen(true)}
            type="button"
            aria-label={t("newPath")}
            title={t("newPath")}
          >
            <span>+</span>
            {!sidebarCollapsed ? <strong>{t("newPath")}</strong> : null}
          </button>

          <div className="path-list">
            {paths.map((entry) => {
              const active = entry.path.id === selectedPathId;
              return (
                <button
                  className={sidebarCollapsed ? (active ? "path-item compact active" : "path-item compact") : active ? "path-item active" : "path-item"}
                  key={entry.path.id}
                  onClick={() => setSelectedPathId(entry.path.id)}
                  type="button"
                  title={entry.path.name}
                >
                  {sidebarCollapsed ? (
                    <>
                      <span className="path-item-monogram">{getPathMonogram(entry.path.name)}</span>
                      <span className="path-item-level-pill">Lv {entry.path.level}</span>
                    </>
                  ) : (
                    <>
                      <div className="path-item-copy">
                        <strong>{entry.path.name}</strong>
                        <span>
                          {t("level")} {entry.path.level}
                        </span>
                      </div>
                      <span
                        className="path-delete"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPendingDeletePath(entry);
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        ×
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <main className="dashboard-main">
          {requestError ? <div className="request-banner">{requestError}</div> : null}

          {selectedPath ? (
            <section className="board-layout">
              <div className="board-column left-column">
                <section className="panel summary-panel">
                  <div className="summary-head">
                    <div>
                      <h2 className="board-path-title">{selectedPath.path.name}</h2>
                    </div>
                    <div className="summary-meta">
                      <strong>{getRankTitle(selectedPath.path.level, locale)}</strong>
                    </div>
                  </div>

                  <div className="summary-main">
                    <button
                      className="hero-emblem compact hero-emblem-button"
                      type="button"
                      onClick={() => setLevelTrackOpen(true)}
                      aria-label={t("levelAtlas")}
                      title={t("levelAtlas")}
                    >
                      <span>{selectedPath.path.level}</span>
                      <small>{t("level")}</small>
                    </button>

                    <div className="overview-content">
                      <div className="hero-metrics">
                        <div>
                          <span>{t("totalXp")}</span>
                          <strong>{selectedPath.path.total_exp.toLocaleString()}</strong>
                        </div>
                        <div>
                          <span>{t("nextLevel")}</span>
                          <strong>{selectedPath.path.xp_to_next_level.toLocaleString()}</strong>
                        </div>
                      </div>
                      <div className="progress-rail">
                        <div className="progress-fill" style={{ width: `${progressWidth}%` }} />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="panel skills-panel">
                  <div className="panel-heading compact">
                    <div>
                      <h3>{t("skills")}</h3>
                    </div>
                    <button
                      className={
                        editorBusy
                          ? "secondary-button icon-action-button ai-button busy"
                          : "secondary-button icon-action-button ai-button"
                      }
                      onClick={() => openDomainCreate(selectedPath.path.id)}
                      type="button"
                      aria-label={t("addSkill")}
                      title={t("addSkill")}
                    >
                      +
                    </button>
                  </div>

                  {selectedPath.domains.length ? (
                    <div className="skills-scroll">
                      <div className="skills-grid single-column">
                        {selectedPath.domains.map((domain, index) => (
                          <button
                            className="skill-card compact"
                            key={domain.id}
                            onClick={() => openDomainView(selectedPath.path.id, domain)}
                            style={{ animationDelay: `${index * 60}ms` }}
                            type="button"
                          >
                            <div className="skill-card-top">
                              <strong>{domain.name}</strong>
                              <span className="skill-tier">{getProficiencyLabel(domain.proficiency_rating, locale)}</span>
                            </div>
                            <p>{domain.proficiency_reason}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="empty-copy">{t("emptySkills")}</p>
                  )}
                </section>
              </div>

              <div className="board-column right-column">
                <section className="badge-flow-shell">
                  <div className="panel-heading compact">
                    <div>
                      <h3>{t("badges")}</h3>
                    </div>
                    <div className="badge-toolbar">
                      {visibleBadges.length > BADGES_PER_PAGE ? (
                        <div className="badge-pagination badge-pagination-toolbar">
                          <button
                            className="badge-page-button"
                            type="button"
                            onClick={() => setBadgePage((current) => Math.max(0, current - 1))}
                            disabled={currentBadgePage === 0}
                            aria-label={locale === "zh" ? "上一頁" : "Previous badges"}
                          >
                            &lt;
                          </button>
                          <button
                            className="badge-page-button"
                            type="button"
                            onClick={() => setBadgePage((current) => Math.min(badgePageCount - 1, current + 1))}
                            disabled={currentBadgePage >= badgePageCount - 1}
                            aria-label={locale === "zh" ? "下一頁" : "Next badges"}
                          >
                            &gt;
                          </button>
                        </div>
                      ) : null}
                      <div className="badge-filter-toggle" aria-label={t("badgeCompleted")}>
                        <button
                          className={badgeVisibility === "pending" ? "badge-filter-chip active" : "badge-filter-chip"}
                          onClick={() => setBadgeVisibility("pending")}
                          type="button"
                        >
                          {t("badgeVisibilityPending")}
                        </button>
                        <button
                          className={badgeVisibility === "completed" ? "badge-filter-chip active" : "badge-filter-chip"}
                          onClick={() => setBadgeVisibility("completed")}
                          type="button"
                        >
                          {t("badgeVisibilityCompleted")}
                        </button>
                      </div>
                      <button
                        className={
                          editorBusy
                            ? "secondary-button icon-action-button ai-button busy"
                            : "secondary-button icon-action-button ai-button"
                        }
                        onClick={() => openBadgeCreate(selectedPath.path.id)}
                        type="button"
                        aria-label={t("addBadge")}
                        title={t("addBadge")}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="badge-flow-page">
                    {visibleBadges.length ? (
                      pagedBadges.map((badge) => (
                        <button
                          className="badge-token"
                          key={badge.id}
                          onClick={() => openBadgeView(selectedPath.path.id, badge)}
                          type="button"
                        >
                          <div className="badge-token-art">
                            <img
                              alt={badge.name}
                              src={getBadgeAssetPath(badge.type, badge.tier)}
                            />
                            <span className="badge-token-progress">{badge.progress}%</span>
                          </div>
                          <div className="badge-token-meta">
                            <strong>{badge.name}</strong>
                          </div>
                        </button>
                      ))
                    ) : (
                      <p className="empty-copy">
                        {badgeVisibility === "completed" ? t("noCompletedBadges") : t("noPendingBadges")}
                      </p>
                    )}
                  </div>
                </section>

                <section className="panel update-panel refined">
                  <div className="panel-heading compact">
                    <div>
                      <h3>{t("actionLog")}</h3>
                    </div>
                  </div>

                  <form className="action-form anchored" onSubmit={handleActionSubmit}>
                    <textarea
                      placeholder={t("actionPlaceholder")}
                      value={actionLog}
                      onChange={(event) => setActionLog(event.target.value)}
                    />
                    <div className="action-submit-row">
                      <button
                        aria-label={actionBusy ? busyLabel : t("submitAction")}
                        className={actionBusy ? "action-send-button busy" : "action-send-button"}
                        disabled={actionBusy}
                        title={actionBusy ? busyLabel : t("submitAction")}
                        type="submit"
                      >
                        {actionBusy ? (
                          <span className="action-send-spinner" aria-hidden="true" />
                        ) : (
                          <svg aria-hidden="true" viewBox="0 0 24 24">
                            <path
                              d="M3 11.5L20 4l-5.5 16-3.5-6-6-2.5zm6.5 1.1l3 1.3 2.2-6.4-5.2 5.1z"
                              fill="currentColor"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </form>
                </section>
              </div>
            </section>
          ) : (
            <section className="panel empty-panel">
              <div className="empty-panel-inner">
                <div className="empty-panel-copy">
                  <span className="empty-panel-kicker">{t("dashboard")}</span>
                  <h2>{t("noPathsTitle")}</h2>
                  <p>{t("noPathsBody")}</p>
                </div>
                <button className="primary-button empty-panel-cta" onClick={() => setCreatePathOpen(true)} type="button">
                  {t("createPath")}
                </button>
              </div>
            </section>
          )}
        </main>
      </div>

      {settingsOpen ? (
        <Modal className="settings-modal" onClose={() => setSettingsOpen(false)}>
          <div className="modal-section settings-hero">
            <h2>{t("settings")}</h2>
          </div>
          <div className="settings-layout">
            <section className="settings-card settings-card-compact settings-language-card">
              <div className="settings-row-head">
                <h3>{t("language")}</h3>
              </div>
              <div className="language-toggle">
                <button
                  className={locale === "en" ? "language-pill active" : "language-pill"}
                  onClick={() => setLocale("en")}
                  type="button"
                >
                  {t("english")}
                </button>
                <button
                  className={locale === "zh" ? "language-pill active" : "language-pill"}
                  onClick={() => setLocale("zh")}
                  type="button"
                >
                  {t("chinese")}
                </button>
              </div>
            </section>

            <section className="settings-card">
              <div className="settings-row-head">
                <h3>{t("accountSettings")}</h3>
                <div className="settings-inline-actions">
                  <button
                    className={settingsEditor === "email" ? "secondary-button active" : "secondary-button"}
                    onClick={() => setSettingsEditor((current) => (current === "email" ? null : "email"))}
                    type="button"
                  >
                    {t("updateEmail")}
                  </button>
                  <button
                    className={settingsEditor === "password" ? "secondary-button active" : "secondary-button"}
                    onClick={() => setSettingsEditor((current) => (current === "password" ? null : "password"))}
                    type="button"
                  >
                    {t("updatePassword")}
                  </button>
                </div>
              </div>

              <div className="account-overview">
                <div className="account-line">
                  <span>{t("email")}</span>
                  <strong>{sessionEmail ?? ""}</strong>
                </div>
                <div className="account-line">
                  <span>{t("password")}</span>
                  <strong>••••••••</strong>
                </div>
              </div>

              {settingsEditor === "email" ? (
                <form className="modal-form settings-form" onSubmit={handleAccountUpdate}>
                  <label className="field">
                    <span>{t("newEmail")}</span>
                    <input
                      type="email"
                      value={accountForm.new_email}
                      onChange={(event) =>
                        setAccountForm((current) => ({ ...current, new_email: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>{t("currentPassword")}</span>
                    <input
                      type="password"
                      value={accountForm.current_password}
                      onChange={(event) =>
                        setAccountForm((current) => ({
                          ...current,
                          current_password: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="settings-submit-row">
                    <button
                      className={settingsBusy === "email" ? "primary-button ai-button busy" : "primary-button"}
                      disabled={settingsBusy !== null}
                      type="submit"
                    >
                      {t("save")}
                    </button>
                  </div>
                </form>
              ) : null}

              {settingsEditor === "password" ? (
                <form className="modal-form settings-form" onSubmit={handlePasswordUpdate}>
                  <label className="field">
                    <span>{t("currentPassword")}</span>
                    <input
                      type="password"
                      value={passwordForm.current_password}
                      onChange={(event) =>
                        setPasswordForm((current) => ({
                          ...current,
                          current_password: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>{t("newPassword")}</span>
                    <input
                      type="password"
                      value={passwordForm.new_password}
                      onChange={(event) =>
                        setPasswordForm((current) => ({
                          ...current,
                          new_password: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>{t("confirmPassword")}</span>
                    <input
                      type="password"
                      value={passwordForm.confirm_password}
                      onChange={(event) =>
                        setPasswordForm((current) => ({
                          ...current,
                          confirm_password: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="settings-submit-row">
                    <button
                      className={settingsBusy === "password" ? "primary-button ai-button busy" : "primary-button"}
                      disabled={settingsBusy !== null}
                      type="submit"
                    >
                      {t("save")}
                    </button>
                  </div>
                </form>
              ) : null}
            </section>
          </div>
          {settingsError ? <p className="error-text">{settingsError}</p> : null}
          {settingsMessage ? <p className="success-text">{settingsMessage}</p> : null}
          <div className="settings-footer">
            <button className="danger-button" onClick={handleLogout} type="button">
              {t("logout")}
            </button>
          </div>
        </Modal>
      ) : null}

      {actionResultOpen && lastActionUpdate?.path_updates.length ? (
        <Modal className="action-result-modal" onClose={() => setActionResultOpen(false)}>
          <div className="modal-section action-result-head">
            <h2>{t("journeyUpdate")}</h2>
          </div>
          <div className="action-result-list">
            {lastActionUpdate.path_updates.map((pathUpdate) => {
              const relatedBadges = lastActionUpdate.badge_updates.filter(
                (badgeUpdate) => badgeUpdate.path_id === pathUpdate.path_id,
              );

              return (
                <section className="action-result-card" key={`${pathUpdate.path_id}-${pathUpdate.new_total_exp}`}>
                  <div className="action-result-top">
                    <div>
                      <h3>{pathUpdate.path_name}</h3>
                    </div>
                    <div className="action-result-xp">+{pathUpdate.exp_gain} XP</div>
                  </div>

                  <div className="action-result-metrics">
                    <div className="result-pill">
                      <span>{t("levelShift")}</span>
                      <strong>
                        {pathUpdate.previous_level} → {pathUpdate.new_level}
                      </strong>
                    </div>
                    <div className="result-pill">
                      <span>{t("totalXp")}</span>
                      <strong>{pathUpdate.new_total_exp.toLocaleString()}</strong>
                    </div>
                  </div>

                  <div className="action-result-section">
                    <span className="action-result-label">{t("overallReview")}</span>
                    <p>{pathUpdate.feedback}</p>
                  </div>

                  <div className="action-result-section">
                    <span className="action-result-label">{t("skillChanges")}</span>
                    {pathUpdate.domain_updates.length ? (
                      <div className="action-change-list">
                        {pathUpdate.domain_updates.map((domainUpdate) => (
                          <div className="action-change-item" key={`${pathUpdate.path_id}-${domainUpdate.name}`}>
                            <strong>{domainUpdate.name}</strong>
                            <span>{getProficiencyLabel(domainUpdate.proficiency_rating, locale)}</span>
                            <p>{domainUpdate.proficiency_reason}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="action-empty">{t("noSkillChanges")}</p>
                    )}
                  </div>

                  <div className="action-result-section">
                    <span className="action-result-label">{t("badgeChanges")}</span>
                    {relatedBadges.length ? (
                      <div className="action-change-list">
                        {relatedBadges.map((badgeUpdate) => (
                          <div className="action-change-item badge" key={badgeUpdate.badge_id}>
                            <strong>{badgeUpdate.badge_name}</strong>
                            <span>
                              {badgeUpdate.previous_progress}% → {badgeUpdate.new_progress}%
                            </span>
                            <p>{badgeUpdate.reason}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="action-empty">{t("noBadgeChanges")}</p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </Modal>
      ) : null}

      {levelTrackOpen && selectedPath ? (
        <Modal className="level-track-modal" onClose={() => setLevelTrackOpen(false)}>
          <div className="modal-section level-track-head">
            <h2>{t("levelAtlas")}</h2>
            <div className="level-track-summary">
              <div className="level-track-summary-pill">
                <span>{t("currentPosition")}</span>
                <strong>
                  Lv {selectedPath.path.level} · {getRankTitle(selectedPath.path.level, locale)}
                </strong>
              </div>
              <div className="level-track-summary-pill">
                <span>{t("rankMilestones")}</span>
                <strong>{milestoneLevels.length}</strong>
              </div>
            </div>
          </div>

          <div className="level-track-scroll" ref={levelTrackScrollRef}>
            <div className="level-track-rail">
              {levelTrack.map((entry) => {
                const isCurrent = entry.level === selectedPath.path.level;
                const isPassed = entry.level < selectedPath.path.level;
                return (
                  <div
                    className={
                      entry.milestone
                        ? isCurrent
                          ? "level-node milestone current"
                          : isPassed
                            ? "level-node milestone passed"
                            : "level-node milestone"
                        : isCurrent
                          ? "level-node current"
                          : isPassed
                            ? "level-node passed"
                            : "level-node"
                    }
                    key={entry.level}
                    data-current-level={isCurrent ? "true" : undefined}
                  >
                    <div className="level-node-marker">
                      <span>Lv {entry.level}</span>
                    </div>
                    {entry.milestone ? <strong>{entry.title}</strong> : <small>{entry.level}</small>}
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      ) : null}

      {createPathOpen ? (
        <Modal className="path-create-modal" onClose={() => setCreatePathOpen(false)}>
          <form className="modal-form" onSubmit={handleCreatePath}>
            <div className="modal-section">
              <h2>{t("newPath")}</h2>
            </div>
            <label className="field">
              <span>{t("routeName")}</span>
              <input
                value={pathForm.route_name}
                onChange={(event) =>
                  setPathForm((current) => ({ ...current, route_name: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>{t("currentStatus")}</span>
              <textarea
                value={pathForm.current_status}
                onChange={(event) =>
                  setPathForm((current) => ({ ...current, current_status: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>{t("pastAchievements")}</span>
              <textarea
                value={pathForm.past_achievements}
                onChange={(event) =>
                  setPathForm((current) => ({
                    ...current,
                    past_achievements: event.target.value,
                  }))
                }
              />
            </label>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setCreatePathOpen(false)} type="button">
                {t("cancel")}
              </button>
              <button
                className={pathBusy ? "primary-button ai-button busy" : "primary-button ai-button"}
                disabled={pathBusy}
                type="submit"
              >
                {pathBusy ? creatingLabel : t("save")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {pendingDeletePath ? (
        <Modal className="delete-path-modal" onClose={() => setPendingDeletePath(null)}>
          <div className="modal-section delete-path-head">
            <h2>{t("deletePath")}</h2>
            <div className="delete-path-card">
              <strong>{pendingDeletePath.path.name}</strong>
              <p>{t("confirmDeletePath")}</p>
            </div>
          </div>
          <div className="modal-actions delete-path-actions">
            <button className="secondary-button" onClick={() => setPendingDeletePath(null)} type="button">
              {t("cancel")}
            </button>
            <button className="danger-button" disabled={editorBusy} onClick={handleDeletePath} type="button">
              {t("delete")}
            </button>
          </div>
        </Modal>
      ) : null}

      {badgeModal.pathId ? (
        <Modal onClose={resetBadgeModal}>
          <form className="modal-form" onSubmit={handleBadgeSave}>
            <div className="modal-section">
              <h2>{t("badgeSettings")}</h2>
            </div>
            <div className="badge-modal-preview">
              <div className="badge-modal-preview-art">
                <img alt={badgeForm.name || t("badges")} src={getBadgeAssetPath(badgeForm.type, badgeForm.tier)} />
              </div>
              <div className="badge-modal-preview-copy">
                <span>{t("badgeName")}</span>
                <input
                  value={badgeForm.name}
                  onChange={(event) =>
                    setBadgeForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>
            </div>
            <label className="field">
              <span>{t("badgeType")}</span>
              <select
                value={badgeForm.type}
                onChange={(event) =>
                  setBadgeForm((current) => ({
                    ...current,
                    type: event.target.value as BadgeType,
                  }))
                }
              >
                <option value="achievement">{t("achievementBadges")}</option>
                <option value="identity">{t("identityBadges")}</option>
              </select>
            </label>
            <label className="field">
              <span>{t("badgeTier")}</span>
              <select
                value={badgeForm.tier}
                onChange={(event) =>
                  setBadgeForm((current) => ({
                    ...current,
                    tier: event.target.value as BadgeTier,
                  }))
                }
              >
                <option value="bronze">{t("bronze")}</option>
                <option value="silver">{t("silver")}</option>
                <option value="gold">{t("gold")}</option>
              </select>
            </label>
            <label className="field">
              <span>{t("badgeProgress")}</span>
              <input
                max={100}
                min={0}
                type="number"
                value={badgeForm.progress}
                onChange={(event) =>
                  setBadgeForm((current) => ({ ...current, progress: Number(event.target.value) }))
                }
              />
            </label>
            <label className="field">
              <span>{t("badgeReason")}</span>
              <textarea
                value={badgeForm.reason}
                onChange={(event) =>
                  setBadgeForm((current) => ({ ...current, reason: event.target.value }))
                }
              />
            </label>
            <div className="modal-actions">
              <div className="modal-action-group">
                {badgeModal.badge ? (
                  <button className="danger-button" disabled={editorBusy} onClick={handleBadgeDelete} type="button">
                    {t("delete")}
                  </button>
                ) : null}
              </div>
              <div className="modal-action-group">
                <button className="secondary-button" onClick={resetBadgeModal} type="button">
                  {t("cancel")}
                </button>
                <button
                  className={editorBusy ? "primary-button ai-button busy" : "primary-button ai-button"}
                  disabled={editorBusy}
                  type="submit"
                >
                  {editorBusy ? busyLabel : t("save")}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      ) : null}

      {domainModal.pathId ? (
        <Modal onClose={resetDomainModal}>
          <form className="modal-form" onSubmit={handleDomainSave}>
            <div className="modal-section">
              <h2>{t("skillSettings")}</h2>
            </div>
            <label className="field">
              <span>{t("skillName")}</span>
              <input
                value={domainForm.name}
                onChange={(event) =>
                  setDomainForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>{t("skillSummary")}</span>
              <textarea
                value={domainForm.summary}
                onChange={(event) =>
                  setDomainForm((current) => ({ ...current, summary: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>{t("level")}</span>
              <select
                value={domainForm.proficiency_rating}
                onChange={(event) =>
                  setDomainForm((current) => ({
                    ...current,
                    proficiency_rating: event.target.value as DomainProficiencyRating,
                  }))
                }
              >
                {proficiencyOptions.map((option) => (
                  <option key={option} value={option}>
                    {getProficiencyLabel(option, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t("skillReason")}</span>
              <textarea
                value={domainForm.proficiency_reason}
                onChange={(event) =>
                  setDomainForm((current) => ({
                    ...current,
                    proficiency_reason: event.target.value,
                  }))
                }
              />
            </label>
            <div className="modal-actions">
              <div className="modal-action-group">
                {domainModal.domain ? (
                  <button className="danger-button" disabled={editorBusy} onClick={handleDomainDelete} type="button">
                    {t("delete")}
                  </button>
                ) : null}
              </div>
              <div className="modal-action-group">
                <button className="secondary-button" onClick={resetDomainModal} type="button">
                  {t("cancel")}
                </button>
                <button
                  className={editorBusy ? "primary-button ai-button busy" : "primary-button ai-button"}
                  disabled={editorBusy}
                  type="submit"
                >
                  {editorBusy ? busyLabel : t("save")}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      ) : null}

      {loadingPaths ? <div className="loading-sheen">{syncingLabel}</div> : null}
    </div>
  );
}

export default App;
