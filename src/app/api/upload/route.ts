import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const data = await req.formData();
    const file: File | null = data.get('file') as unknown as File;

    if (!file) {
      return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    // Generate safe unique filename
    const ext = path.extname(file.name) || '.jpg';
    const uniqueName = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    const filePath = path.join(uploadsDir, uniqueName);

    await writeFile(filePath, buffer);

    return NextResponse.json({
      success: true,
      url: `/uploads/${uniqueName}`,
      filename: uniqueName,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'File upload failed' },
      { status: 500 }
    );
  }
}

