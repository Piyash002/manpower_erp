import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const PHOTO_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/x-png',
  'image/webp',
]);
const DOC_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR', 'Counselor', 'Accountant']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const data = await req.formData();
    const file: File | null = data.get('file') as unknown as File;
    const kind = String(data.get('kind') || '').toLowerCase();

    if (!file) {
      return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
    }

    if (kind === 'photo') {
      if (!PHOTO_MIMES.has(file.type)) {
        return NextResponse.json(
          { success: false, message: 'Profile photo must be a JPG, PNG, or WebP image.' },
          { status: 400 }
        );
      }
      if (file.size > 2 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, message: 'Profile photo size must not exceed 2 MB.' },
          { status: 400 }
        );
      }
    } else if (kind === 'document') {
      if (!DOC_MIMES.has(file.type)) {
        return NextResponse.json(
          {
            success: false,
            message: 'Document must be PDF, JPG, PNG, WebP, or DOC/DOCX.',
          },
          { status: 400 }
        );
      }
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, message: 'Document size must not exceed 5 MB.' },
          { status: 400 }
        );
      }
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const subDir = kind === 'photo' ? 'employees/photos' : kind === 'document' ? 'employees/docs' : '';
    const uploadsDir = subDir
      ? path.join(process.cwd(), 'public', 'uploads', subDir)
      : path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    const ext = path.extname(file.name) || (kind === 'photo' ? '.jpg' : '.bin');
    const prefix = kind === 'photo' ? 'emp_photo' : kind === 'document' ? 'emp_doc' : 'doc';
    const uniqueName = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    const filePath = path.join(uploadsDir, uniqueName);

    await writeFile(filePath, buffer);

    const relUrl = subDir ? `/api/uploads/${subDir}/${uniqueName}` : `/api/uploads/${uniqueName}`;
    return NextResponse.json({
      success: true,
      url: relUrl,
      filename: uniqueName,
      size: file.size,
      mimeType: file.type,
    });
  } catch (error: unknown) {
    console.error('Upload error:', error);
    const msg = error instanceof Error ? error.message : 'File upload failed';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
