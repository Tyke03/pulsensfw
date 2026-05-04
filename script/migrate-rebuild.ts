/**
 * PulseNSFW Architecture Rebuild — DB Migration
 * Adds: qc_status, qc_notes, research_source to posts
 * Adds: tracking_status, signup_url, commission_rate, notes to affiliates
 * Migrates: commissionNotes → notes in affiliates (if column exists)
 * Strips [QC: ...] title prefixes → populates qc_status field
 * Idempotent — safe to run multiple times.
 */

import { Pool } from 'pg';

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    console.log('=== PulseNSFW Rebuild Migration ===\n');

    // ─── POSTS TABLE ────────────────────────────────────────────────────────
    console.log('1. posts.qc_status...');
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='posts' AND column_name='qc_status') THEN
          ALTER TABLE posts ADD COLUMN qc_status TEXT NOT NULL DEFAULT 'pending';
        END IF;
      END $$;
    `);
    console.log('   ✓ qc_status');

    console.log('2. posts.qc_notes...');
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='posts' AND column_name='qc_notes') THEN
          ALTER TABLE posts ADD COLUMN qc_notes TEXT;
        END IF;
      END $$;
    `);
    console.log('   ✓ qc_notes');

    console.log('3. posts.research_source...');
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='posts' AND column_name='research_source') THEN
          ALTER TABLE posts ADD COLUMN research_source TEXT;
        END IF;
      END $$;
    `);
    console.log('   ✓ research_source');

    // ─── AFFILIATES TABLE ──────────────────────────────────────────────────
    console.log('4. affiliates.tracking_status...');
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='affiliates' AND column_name='tracking_status') THEN
          ALTER TABLE affiliates ADD COLUMN tracking_status TEXT NOT NULL DEFAULT 'unverified';
        END IF;
      END $$;
    `);
    console.log('   ✓ tracking_status');

    console.log('5. affiliates.signup_url...');
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='affiliates' AND column_name='signup_url') THEN
          ALTER TABLE affiliates ADD COLUMN signup_url TEXT;
        END IF;
      END $$;
    `);
    console.log('   ✓ signup_url');

    console.log('6. affiliates.commission_rate...');
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='affiliates' AND column_name='commission_rate') THEN
          ALTER TABLE affiliates ADD COLUMN commission_rate TEXT;
        END IF;
      END $$;
    `);
    console.log('   ✓ commission_rate');

    console.log('7. affiliates.notes...');
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='affiliates' AND column_name='notes') THEN
          ALTER TABLE affiliates ADD COLUMN notes TEXT;
        END IF;
      END $$;
    `);
    // Migrate commission_notes → notes if commission_notes exists
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='affiliates' AND column_name='commission_notes') THEN
          UPDATE affiliates SET notes = commission_notes WHERE notes IS NULL AND commission_notes IS NOT NULL;
        END IF;
      END $$;
    `);
    console.log('   ✓ notes');

    // ─── QC TITLE PREFIX MIGRATION ─────────────────────────────────────────
    console.log('\n8. Stripping [QC: ...] title prefixes → qc_status field...');
    const { rows: posts } = await client.query(`SELECT id, title, qc_status FROM posts`);
    let migrated = 0;

    for (const post of posts) {
      const title: string = post.title;
      let qcStatus: string | null = null;
      let cleanTitle = title;

      if (title.startsWith('[QC: APPROVED]')) {
        qcStatus = 'approved';
        cleanTitle = title.replace(/^\[QC: APPROVED\]\s*/i, '').trim();
      } else if (title.startsWith('[QC: REVISION NEEDED]')) {
        qcStatus = 'revision_needed';
        cleanTitle = title.replace(/^\[QC: REVISION NEEDED\]\s*/i, '').trim();
      } else if (title.startsWith('[QC: FACT CHECK]')) {
        qcStatus = 'fact_check';
        cleanTitle = title.replace(/^\[QC: FACT CHECK\]\s*/i, '').trim();
      } else if (title.match(/^\[QC:/i)) {
        console.log(`   ⚠️  Unknown QC prefix on post ${post.id}: "${title.substring(0, 60)}"`);
        continue;
      }

      if (qcStatus && cleanTitle !== title) {
        await client.query(
          `UPDATE posts SET title = $1, qc_status = $2 WHERE id = $3`,
          [cleanTitle, qcStatus, post.id]
        );
        console.log(`   ✓ Post ${post.id} → "${cleanTitle.substring(0, 55)}" [${qcStatus}]`);
        migrated++;
      }
    }

    console.log(`   Migrated ${migrated} post titles`);

    // ─── VERIFY ────────────────────────────────────────────────────────────
    console.log('\n9. Verify...');
    const { rows: cols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name IN ('posts','affiliates')
      AND column_name IN ('qc_status','qc_notes','research_source','tracking_status','signup_url','commission_rate','notes')
      ORDER BY table_name, column_name
    `);
    cols.forEach(c => console.log(`   ✓ ${c.column_name}`));

    console.log('\n=== Migration Complete ✓ ===');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('\nMigration FAILED:', err.message);
  process.exit(1);
});
