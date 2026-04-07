import { NextResponse } from 'next/server';

// CRON: Monthly KPI snapshot (runs on the 1st of each month)
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // TODO: Capture all KPI values into kpi_snapshots table (immutable)
  return NextResponse.json({
    success: true,
    message: 'Monthly snapshot stub',
  });
}
