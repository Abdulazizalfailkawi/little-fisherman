// The single admin account. This only decides what the UI shows; anything
// sensitive (AI identification, user statistics) is enforced on the server.

import { useStore } from "./db/store";

export const ADMIN_EMAIL = "alfailkaw33@gmail.com";

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === ADMIN_EMAIL;
}

export function useIsAdmin(): boolean {
  const { user } = useStore();
  return isAdminEmail(user?.email);
}
