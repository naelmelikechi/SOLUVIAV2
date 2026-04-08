import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';

// CRON: Monthly KPI snapshot (runs on the 1st of each month)
export async function POST(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  // TODO: Capture all KPI values into kpi_snapshots table (immutable)
  return NextResponse.json({
    success: true,
    message: 'Monthly snapshot stub',
  });
}
