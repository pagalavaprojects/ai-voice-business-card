/**
 * Password rules, shared by sign-up and password reset so the two can never
 * disagree about what "strong enough" means. Pure and dependency-free, which
 * is what lets the rules be unit-tested directly rather than only through a
 * rendered form.
 *
 * The minimum is deliberately length-led rather than a symbol checklist:
 * length is what actually resists guessing, and symbol quotas mostly produce
 * predictable substitutions. The character-class requirement exists only to
 * stop the obvious low-entropy cases.
 */
export const MIN_PASSWORD_LENGTH = 12;

export interface PasswordVerdict {
  ok: boolean;
  /** Written for the person typing, not for a log. */
  problems: string[];
}

export function assessPassword(password: string, context: { email?: string; name?: string } = {}): PasswordVerdict {
  const problems: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 3) {
    problems.push("Mix upper case, lower case, numbers or symbols — at least three of the four.");
  }

  if (password.length > 0 && /^(.)\1+$/.test(password)) {
    problems.push("A single repeated character is not a password.");
  }

  // Containing your own address or name is the most common weak choice and
  // the easiest for someone who knows you to guess.
  const localPart = (context.email ?? "").split("@")[0]?.toLowerCase();
  if (localPart && localPart.length >= 3 && password.toLowerCase().includes(localPart)) {
    problems.push("Do not include your email address in your password.");
  }
  const name = (context.name ?? "").trim().toLowerCase();
  if (name.length >= 3 && password.toLowerCase().includes(name)) {
    problems.push("Do not include your name in your password.");
  }

  return { ok: problems.length === 0, problems };
}

/** The single message shown for ANY failed sign-in. Distinguishing "no such
 * account" from "wrong password" tells an attacker which addresses are
 * registered, so both paths say exactly this. */
export const GENERIC_SIGN_IN_ERROR = "Unable to sign in with those credentials.";

/** Password recovery says the same thing whether or not the address is
 * registered, for the same reason. */
export const GENERIC_RECOVERY_MESSAGE =
  "If that address has an account, a password reset link is on its way. Check your inbox and spam folder.";

/**
 * What a visitor is told when sign-up fails.
 *
 * Supabase's own message is written for a developer reading a stack trace,
 * not for someone at a sign-up form: a real attempt against production came
 * back as the bare string "email rate limit exceeded", which describes the
 * project's mail quota rather than anything the visitor did or can fix.
 * Worse, passing provider text straight through means any future message
 * Supabase adds is published verbatim, including ones that describe
 * configuration.
 *
 * Only the cases a visitor can act on get their own wording; everything else
 * gets one neutral message.
 */
export const GENERIC_SIGN_UP_ERROR = "We couldn't create that account just now. Please try again in a moment.";

export function signUpErrorMessage(providerMessage: string): string {
  const message = providerMessage.toLowerCase();

  if (/rate limit|too many/.test(message)) {
    return "Too many sign-up attempts right now. Please wait a few minutes and try again.";
  }
  if (/password/.test(message)) {
    return `Choose a stronger password — at least ${MIN_PASSWORD_LENGTH} characters, mixing letters, numbers or symbols.`;
  }
  if (/email address.*invalid|invalid.*email|unable to validate email/.test(message)) {
    return "Enter a valid email address.";
  }
  if (/signups? not allowed|signup is disabled/.test(message)) {
    return "New accounts aren't being accepted at the moment.";
  }
  return GENERIC_SIGN_UP_ERROR;
}
