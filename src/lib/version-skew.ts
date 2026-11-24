/**
 * A page opened before an update can try a button whose code the new server no longer has ("Server Action … was not found").
 * It is not a fault in the app: reloading the page gets the new version. Used by the browser (to reload by itself) and by
 * System Alerts (to leave it out of App Errors).
 */
export const isVersionSkew = (message: string) => /server action .{0,80}(was )?not (be )?found|failed[- ]to[- ]find[- ]server[- ]action|UnrecognizedActionError/i.test(message);
