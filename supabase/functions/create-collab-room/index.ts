import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type CreateRoomBody = {
  room_public_id: string;
  editor_code_hash: string;
  viewer_code_hash: string;
  encrypted_payload: string;
  payload_hash: string;
  app_version?: string;
  collab_protocol_version?: number;
  expires_in_hours?: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Supabase service credentials are not configured" }, 500);
  }

  let body: CreateRoomBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (
    !body.room_public_id ||
    !body.editor_code_hash ||
    !body.viewer_code_hash ||
    !body.encrypted_payload ||
    !body.payload_hash
  ) {
    return json({
      error: "room_public_id, editor_code_hash, viewer_code_hash, encrypted_payload and payload_hash are required",
    }, 400);
  }

  const expiresInHours = Math.min(Math.max(body.expires_in_hours ?? 72, 1), 24 * 30);
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: room, error: roomError } = await client
    .from("collab_rooms")
    .insert({
      room_public_id: body.room_public_id,
      status: "active",
      expires_at: expiresAt,
      latest_snapshot_version: 1,
    })
    .select("id, room_public_id, expires_at, latest_snapshot_version")
    .single();

  if (roomError || !room) {
    return json({ error: "Could not create collaboration room", details: roomError?.message }, 500);
  }

  const { error: inviteError } = await client.from("collab_room_invites").insert([
    { room_id: room.id, role: "editor", code_hash: body.editor_code_hash, expires_at: expiresAt },
    { room_id: room.id, role: "viewer", code_hash: body.viewer_code_hash, expires_at: expiresAt },
  ]);

  if (inviteError) {
    await client.from("collab_rooms").delete().eq("id", room.id);
    return json({ error: "Could not create room invites", details: inviteError.message }, 500);
  }

  const { error: snapshotError } = await client.from("collab_room_snapshots").insert({
    room_id: room.id,
    version: 1,
    encrypted_payload: body.encrypted_payload,
    payload_hash: body.payload_hash,
    app_version: body.app_version ?? "unknown",
    collab_protocol_version: body.collab_protocol_version ?? 1,
  });

  if (snapshotError) {
    await client.from("collab_rooms").delete().eq("id", room.id);
    return json({ error: "Could not save initial snapshot", details: snapshotError.message }, 500);
  }

  return json({
    room_id: room.id,
    room_public_id: room.room_public_id,
    expires_at: room.expires_at,
    latest_snapshot_version: room.latest_snapshot_version,
  });
});
