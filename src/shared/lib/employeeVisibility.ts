/**
 * Whether an employee's public business card should be served.
 *
 * The test is `=== false`, not `!employee.is_active`, and that distinction is
 * the whole reason this lives in a named, tested function rather than inline in
 * the route.
 *
 * `is_active` arrives with migration 20260807. On a database where that
 * migration has not been applied, PostgREST simply omits the field, so a
 * truthiness check would read every employee as deactivated and 404 every card
 * in production — the same silent, total outage the catalog release caused when
 * it shipped ahead of its own migration. An absent column means "no opinion",
 * which matches the migration's own DEFAULT TRUE; only an explicit `false`
 * takes a card offline.
 */
export function isEmployeeCardVisible(employee: { is_active?: boolean | null }): boolean {
  return employee.is_active !== false;
}
