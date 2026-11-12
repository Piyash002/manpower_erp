import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { buildXlsxBuffer } from '@/lib/export-utils';

const exportSchema = z.object({
  filename: z.string().trim().min(1).max(120).default('export'),
  sheetName: z.string().trim().min(1).max(31).optional(),
  headers: z.array(z.string()).min(1).max(100),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()]))).max(20000),
});

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const parsed = exportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || 'Invalid export payload' },
        { status: 400 }
      );
    }

    const { filename, sheetName, headers, rows } = parsed.data;
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.xlsx$/i, '') || 'export';
    const buf = buildXlsxBuffer(sheetName || 'Data', headers, rows);

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${safeName}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to build Excel workbook' },
      { status: 500 }
    );
  }
}
