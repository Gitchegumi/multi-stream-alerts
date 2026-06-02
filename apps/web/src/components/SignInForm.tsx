"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

type Mode = "signin" | "register";

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "Invalid email or password.",
  EMAIL_TAKEN: "An account with that email already exists.",
  INVITE_INVALID: "Invite code is invalid.",
  INVITE_REVOKED: "This invite code has been revoked.",
  INVITE_EXPIRED: "This invite code has expired.",
  INVITE_EXHAUSTED: "This invite code has already been used.",
  LOCAL_REGISTRATION_DISABLED: "Local registration is disabled on this instance.",
  VALIDATION: "Please check the form for errors."
};

export function SignInForm({
  callbackUrl,
  initialError,
  localEnabled = true,
  mode: initialMode = "signin"
}: {
  callbackUrl?: string;
  initialError?: string;
  localEnabled?: boolean;
  mode?: Mode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(initialError ? ERROR_MESSAGES[initialError] ?? "Sign-in failed." : null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isRegister = mode === "register";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(null);

    if (isRegister) {
      if (password !== confirmPassword) {
        setFieldError("confirmPassword");
        setError("Passwords do not match.");
        return;
      }
      startTransition(async () => {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, confirmPassword, inviteCode, displayName: displayName || undefined })
        });
        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          code?: string;
          message?: string;
          field?: string;
        };
        if (!response.ok || !data.ok) {
          setFieldError(data.field ?? null);
          setError(ERROR_MESSAGES[data.code ?? ""] ?? data.message ?? "Registration failed.");
          return;
        }
        // Auto-sign-in the freshly registered user via the credentials provider.
        const signInResult = await signIn("credentials", {
          email,
          password,
          redirect: false,
          callbackUrl: callbackUrl ?? "/dashboard"
        });
        if (signInResult?.error) {
          setError("Account created but sign-in failed. Please sign in manually.");
          router.push("/signin");
          return;
        }
        router.push(callbackUrl ?? "/dashboard");
        router.refresh();
      });
      return;
    }

    startTransition(async () => {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: callbackUrl ?? "/dashboard"
      });
      if (result?.error) {
        setError(ERROR_MESSAGES[result.error] ?? "Invalid email or password.");
        return;
      }
      router.push(callbackUrl ?? "/dashboard");
      router.refresh();
    });
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      {localEnabled ? (
        <>
          {isRegister && (
            <label className="auth-field">
              <span>Display name (optional)</span>
              <input
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={80}
                disabled={pending}
              />
            </label>
          )}
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
              aria-invalid={fieldError === "email" ? true : undefined}
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              minLength={isRegister ? 12 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              aria-invalid={fieldError === "password" ? true : undefined}
            />
          </label>
          {isRegister && (
            <>
              <label className="auth-field">
                <span>Confirm password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={pending}
                  aria-invalid={fieldError === "confirmPassword" ? true : undefined}
                />
              </label>
              <label className="auth-field">
                <span>Invite code</span>
                <input
                  type="text"
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  disabled={pending}
                  placeholder="ABCD-EFGH-JKLM"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={fieldError === "inviteCode" ? true : undefined}
                />
              </label>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button primary" disabled={pending}>
            {pending ? "Working…" : isRegister ? "Create account" : "Sign in"}
          </button>
        </>
      ) : (
        <p className="muted">Local email/password sign-in is disabled on this instance.</p>
      )}

      <div className="auth-divider">
        <span>or</span>
      </div>

      <button
        type="button"
        className="button secondary"
        onClick={() => signIn("oidc", { callbackUrl: callbackUrl ?? "/dashboard" })}
        disabled={pending}
      >
        Continue with OIDC
      </button>

      {localEnabled && (
        <p className="muted small">
          {isRegister ? "Already have an account?" : "Need an account?"}{" "}
          <a
            href={isRegister ? "/signin" : "/register"}
            onClick={(e) => {
              e.preventDefault();
              setMode(isRegister ? "signin" : "register");
              setError(null);
              setFieldError(null);
            }}
          >
            {isRegister ? "Sign in" : "Create one with an invite code"}
          </a>
        </p>
      )}
    </form>
  );
}
