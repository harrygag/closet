import { supabaseAdmin } from '../_lib/supabase-admin'

interface MigrateRequest {
  email: string
  scope?: 'all' | 'unassigned'
}

export async function POST(request: Request) {
  try {
    const body: MigrateRequest = await request.json()
    const email = (body.email || '').trim().toLowerCase()
    const scope = body.scope || 'all'

    if (!email) {
      return new Response(JSON.stringify({ error: 'email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 1) Resolve target user id from application users table
    const { data: userRow, error: userErr } = await (supabaseAdmin as any)
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single()

    if (userErr || !userRow) {
      return new Response(JSON.stringify({ error: `User not found in users table for email ${email}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const targetUserId: string = userRow.id

    // 2) Build filter for scope
    const orFilter = scope === 'unassigned'
      ? `user_id.is.null`
      : `user_id.is.null,user_id.neq.${targetUserId}`

    // 3) Migrate cards
    const { error: cardsErr } = await (supabaseAdmin as any)
      .from('cards')
      .update({ user_id: targetUserId })
      .or(orFilter)

    if (cardsErr) throw cardsErr

    // 4) Migrate marketplace_snapshots to match card ownership (best-effort)
    const { error: snapsErr } = await (supabaseAdmin as any)
      .from('marketplace_snapshots')
      .update({ user_id: targetUserId })
      .or(orFilter)

    if (snapsErr) throw snapsErr

    // 5) Migrate feedback rows
    const { error: feedbackErr } = await (supabaseAdmin as any)
      .from('feedback')
      .update({ user_id: targetUserId })
      .or(orFilter)

    if (feedbackErr) throw feedbackErr

    return new Response(JSON.stringify({ success: true, user_id: targetUserId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Migration failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}


