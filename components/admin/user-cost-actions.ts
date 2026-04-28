'use server';

import { getUserCostInfo } from '@/lib/queries/employee-cost';
import { updateUserCost } from '@/lib/actions/employee-cost';
import type { EmployeeCostInputs } from '@/lib/utils/employee-cost';

// Wrappers minces appeles depuis le composant client. Les vraies verifications
// admin sont faites dans getUserCostInfo / updateUserCost (assertAdmin).

export async function fetchUserCost(
  userId: string,
): Promise<EmployeeCostInputs | null> {
  try {
    return await getUserCostInfo(userId);
  } catch {
    return null;
  }
}

export async function saveUserCost(userId: string, fields: EmployeeCostInputs) {
  return updateUserCost(userId, fields);
}
