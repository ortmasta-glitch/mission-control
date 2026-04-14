import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { rotateKey, isHmacProtected } from '@/lib/crypto-utils';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const STORAGE_BASE = process.env.DOCUMENTS_PATH || '/app/data/documents';

/**
 * POST /api/admin/key-rotation
 *
 * Rotate encryption keys for all stored documents.
 * Requires the current MC_API_TOKEN and a new token.
 * Decrypts all documents with the old token, re-encrypts with the new token.
 *
 * This is a destructive, non-reversible operation. Back up the database
 * and document store before running.
 *
 * Request body:
 *   { current_token: string, new_token: string }
 *
 * Returns:
 *   { success: true, rotated: number, errors: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { current_token, new_token } = body;

    if (!current_token || !new_token) {
      return NextResponse.json({ error: 'Both current_token and new_token are required' }, { status: 400 });
    }

    if (current_token === new_token) {
      return NextResponse.json({ error: 'new_token must differ from current_token' }, { status: 400 });
    }

    if (new_token.length < 16) {
      return NextResponse.json({ error: 'new_token must be at least 16 characters' }, { status: 400 });
    }

    const db = getDb();
    const documents = db.prepare('SELECT id, category, filename, encrypted FROM documents').all() as {
      id: string; category: string; filename: string; encrypted: number;
    }[];

    const errors: string[] = [];
    let rotated = 0;

    for (const doc of documents) {
      if (!doc.encrypted) {
        // Not encrypted, nothing to rotate
        continue;
      }

      const filePath = path.join(STORAGE_BASE, doc.category, doc.filename);
      if (!fs.existsSync(filePath)) {
        errors.push(`Document ${doc.id} (${doc.filename}): file not found on disk, skipping`);
        continue;
      }

      try {
        const raw = fs.readFileSync(filePath);
        const reEncrypted = rotateKey(raw, current_token, new_token);
        fs.writeFileSync(filePath, reEncrypted);
        rotated++;
      } catch (err) {
        errors.push(`Document ${doc.id} (${doc.filename}): decrypt/rotate failed — ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
    }

    return NextResponse.json({
      success: true,
      rotated,
      total: documents.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Rotated encryption for ${rotated} of ${documents.length} documents. Update MC_API_TOKEN in your environment to the new token and restart the server.`,
    });
  } catch (error) {
    console.error('[key-rotation POST]', error);
    return NextResponse.json({ error: 'Key rotation failed' }, { status: 500 });
  }
}

/**
 * GET /api/admin/key-rotation
 *
 * Check the status of encryption across all documents.
 * Returns how many documents are encrypted, and how many use v1 (no HMAC) vs v2 (HMAC-protected).
 */
export async function GET() {
  try {
    const db = getDb();
    const documents = db.prepare('SELECT id, category, filename, encrypted FROM documents').all() as {
      id: string; category: string; filename: string; encrypted: number;
    }[];

    let v1Count = 0;
    let v2Count = 0;
    let unencrypted = 0;
    let missingFiles = 0;

    for (const doc of documents) {
      if (!doc.encrypted) {
        unencrypted++;
        continue;
      }

      const filePath = path.join(STORAGE_BASE, doc.category, doc.filename);
      if (!fs.existsSync(filePath)) {
        missingFiles++;
        continue;
      }

      try {
        const raw = fs.readFileSync(filePath);
        if (isHmacProtected(raw)) {
          v2Count++;
        } else {
          v1Count++;
        }
      } catch {
        missingFiles++;
      }
    }

    return NextResponse.json({
      total: documents.length,
      encrypted_v2_hmac: v2Count,
      encrypted_v1_legacy: v1Count,
      unencrypted,
      missing_files: missingFiles,
      recommendation: v1Count > 0
        ? `${v1Count} document(s) use legacy v1 encryption without HMAC integrity. Run key rotation to upgrade to v2 HMAC-protected format.`
        : undefined,
    });
  } catch (error) {
    console.error('[key-rotation GET]', error);
    return NextResponse.json({ error: 'Failed to check encryption status' }, { status: 500 });
  }
}