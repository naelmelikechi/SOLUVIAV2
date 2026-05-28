'use server';

import { getUserCostInfo } from '@/lib/queries/employee-cost';
import { updateUserCost } from '@/lib/actions/employee-cost';
import type { EmployeeCostInputs } from '@/lib/utils/employee-cost';
import { checkAuth } from '@/lib/auth/guards';

// Wrappers minces appeles depuis le composant client. Les vraies verifications
// admin sont faites dans getUserCostInfo / updateUserCost (assertAdmin).

export async function fetchUserCost(
  userId: string,
): Promise<EmployeeCostInputs | null> {
  const auth = await checkAuth();
  if (!auth.ok) return null;
  try {
    return await getUserCostInfo(userId);
  } catch {
    return null;
  }
}

export async function saveUserCost(userId: string, fields: EmployeeCostInputs) {
  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error } as const;
  return updateUserCost(userId, fields);
}
