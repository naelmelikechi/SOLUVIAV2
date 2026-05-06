'use server';

import { getContratDetail } from '@/lib/queries/contrats';

export async function fetchContratDetail(contratId: string) {
  return getContratDetail(contratId);
}
