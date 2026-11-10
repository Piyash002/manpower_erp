import { NextResponse } from 'next/server';
import { seedDatabase } from '@/lib/seed';

export async function GET() {
  try {
    await seedDatabase();
    return NextResponse.json({
      success: true,
      message: 'Database checked and seeded successfully with default Admin, test users, sample trades and country costs.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Seeding failed' },
      { status: 500 }
    );
  }
}

