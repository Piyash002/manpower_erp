import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// Comprehensive support for all image formats
const ALLOWED_IMAGE_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.svg',
  '.bmp',
  '.tiff',
  '.tif',
  '.avif',
  '.heic',
  '.heif',
  '.ico',
]);

const ALLOWED_DOC_EXTS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
]);

function isAllowedFile(name: string, mime: string, kind: string): boolean {
  const ext = path.extname(name).toLowerCase();
  const isImage = ALLOWED_IMAGE_EXTS.has(ext) || mime.startsWith('image/');
  const isDoc = ALLOWED_DOC_EXTS.has(ext) || mime === 'application/pdf' || mime.includes('word') || mime.includes('document');

  if (kind === 'photo') {
    return isImage;
  }
  if (kind === 'receipt_proof' || kind === 'document') {
    return isImage || isDoc;
  }
  // Default: allow all common images and documents
  return isImage || isDoc;
}

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

    if (!isAllowedFile(file.name, file.type, kind)) {
      return NextResponse.json(
        {
          success: false,
          message:
            kind === 'photo'
              ? 'Profile photo must be an image file (JPG, PNG, WebP, GIF, SVG, BMP, AVIF, HEIC).'
              : 'File must be an image (JPG, PNG, WebP, GIF, etc.) or document (PDF, DOC, DOCX).',
        },
        { status: 400 }
      );
    }

    // Limit up to 10 MB for high-resolution images & multi-page PDFs
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, message: 'File size must not exceed 10 MB.' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const folder =
      kind === 'photo'
        ? 'manpower_erp/photos'
        : kind === 'receipt_proof'
        ? 'manpower_erp/receipts'
        : kind === 'document'
        ? 'manpower_erp/documents'
        : 'manpower_erp/uploads';

    let fileUrl = '';
    let publicId = '';

    // Primary: Upload buffer to Cloudinary
    try {
      const cloudinaryResult = await uploadToCloudinary(buffer, {
        folder,
        filename: file.name,
        resourceType: 'auto',
      });
      fileUrl = cloudinaryResult.secure_url;
      publicId = cloudinaryResult.public_id;
    } catch (cloudErr: any) {
      console.warn('Cloudinary upload error, falling back to local storage:', cloudErr?.message || cloudErr);

      // Safe local fallback so the system NEVER fails if external network is momentarily restricted
      const subDir =
        kind === 'photo'
          ? 'employees/photos'
          : kind === 'document'
          ? 'employees/docs'
          : kind === 'receipt_proof'
          ? 'accounts/receipts'
          : '';
      const uploadsDir = subDir
        ? path.join(process.cwd(), 'public', 'uploads', subDir)
        : path.join(process.cwd(), 'public', 'uploads');
      await mkdir(uploadsDir, { recursive: true });

      const ext = path.extname(file.name) || '.bin';
      const prefix =
        kind === 'photo'
          ? 'emp_photo'
          : kind === 'document'
          ? 'emp_doc'
          : kind === 'receipt_proof'
          ? 'mr_proof'
          : 'doc';
      const uniqueName = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
      const filePath = path.join(uploadsDir, uniqueName);
      await writeFile(filePath, buffer);

      fileUrl = subDir ? `/api/uploads/${subDir}/${uniqueName}` : `/api/uploads/${uniqueName}`;
      publicId = uniqueName;
    }

    return NextResponse.json({
      success: true,
      url: fileUrl,
      filename: file.name,
      publicId,
      size: file.size,
      mimeType: file.type,
    });
  } catch (error: unknown) {
    console.error('Upload error:', error);
    const msg = error instanceof Error ? error.message : 'File upload failed';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
