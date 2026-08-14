import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const logs = await prisma.sendLog.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      recipient: true,
      subject: true,
      mailgunAccountId: true,
      status: true,
      errorMessage: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ logs });
}
