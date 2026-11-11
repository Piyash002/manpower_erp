import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const segments = (await params).path || [];
    if (segments.length === 0) {
      return NextResponse.json({ success: false, message: 'File path required' }, { status: 400 });
    }

    const uploadsRoot = path.resolve(process.cwd(), 'public', 'uploads');
    const targetPath = path.resolve(uploadsRoot, ...segments);

    if (!targetPath.startsWith(uploadsRoot + path.sep) && targetPath !== uploadsRoot) {
      return NextResponse.json({ success: false, message: 'Forbidden path' }, { status: 403 });
    }

    const info = await stat(targetPath);
    if (!info.isFile()) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }

    const data = await readFile(targetPath);
    const ext = path.extname(targetPath).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ success: false, message: 'File not found' }, { status: 404 });
  }
}

