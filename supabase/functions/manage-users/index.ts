import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.1'

type UserRole = 'admin' | 'supervisor' | 'viewer'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error('Missing Supabase environment variables.')
    }

    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: authData, error: authError } = await userClient.auth.getUser()
    if (authError || !authData.user) {
      throw new Error('Unauthorized.')
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    if (profileError || profile?.role !== 'admin') {
      throw new Error('Only admins can manage users.')
    }

    const body = await req.json()
    const action = String(body.action || '')

    if (action === 'list') {
      const { data: profiles, error } = await adminClient
        .from('profiles')
        .select('id, username, role, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error

      const users = await Promise.all(
        (profiles || []).map(async (item) => {
          const { data } = await adminClient.auth.admin.getUserById(item.id)
          return {
            id: item.id,
            username: item.username,
            email: data.user?.email || '',
            role: item.role,
            createdAt: item.created_at,
          }
        }),
      )

      return json({ users })
    }

    if (action === 'create') {
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      const username = String(body.username || '').trim() || email
      const role = String(body.role || 'viewer') as UserRole

      if (!email || !password) throw new Error('Email and password are required.')
      if (!['admin', 'supervisor', 'viewer'].includes(role)) throw new Error('Invalid role.')

      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (error) throw error
      if (!data.user) throw new Error('User was not created.')

      const { error: profileInsertError } = await adminClient.from('profiles').upsert({
        id: data.user.id,
        username,
        role,
      })
      if (profileInsertError) throw profileInsertError

      return json({ ok: true })
    }

    if (action === 'delete') {
      const userId = String(body.userId || '')
      if (!userId) throw new Error('Missing userId.')
      if (userId === authData.user.id) throw new Error('You cannot delete your own active user.')

      const { error } = await adminClient.auth.admin.deleteUser(userId)
      if (error) throw error
      return json({ ok: true })
    }

    throw new Error('Invalid action.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.'
    return json({ ok: false, message }, 400)
  }
})

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
