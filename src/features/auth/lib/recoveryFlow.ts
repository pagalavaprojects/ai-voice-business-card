/**
 * The marker /auth/callback sets when it exchanges a RECOVERY link, and the
 * reset page requires before it will change anybody's password.
 *
 * It lives in its own module because the route handler and the client page
 * must agree on the name, and a route file cannot export a shared constant
 * to a client component without dragging server code into the bundle.
 *
 * It is not a credential: on its own it grants nothing. It only distinguishes
 * "this person followed a recovery link" from "this browser happens to have
 * somebody signed in".
 */
export const RECOVERY_FLOW_COOKIE = "maylaan-recovery-flow";
