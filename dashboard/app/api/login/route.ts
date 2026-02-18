import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (password === process.env.DASHBOARD_PASSWORD) {
      const session = await getSession();
      session.isAuthenticated = true;
      session.loginTime = Date.now();
      await session.save();

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid password' },
      { status: 401 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
