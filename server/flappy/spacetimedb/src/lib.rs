use spacetimedb::{ReducerContext, Table, Identity};

// ─── Tables ──────────────────────────────────────────────────────────────────

#[spacetimedb::table(name = "player", accessor = player, public)]
pub struct Player {
    #[primary_key]
    pub identity: Identity,
    pub username: String,
    pub color_hex: String,
    pub session_id: u32,
    pub is_alive: bool,
    pub score: u32,
    pub is_ready: bool,
}

#[spacetimedb::table(name = "bird", accessor = bird, public)]
pub struct Bird {
    #[primary_key]
    pub player_identity: Identity,
    pub x: f32,
    pub y: f32,
    pub velocity_y: f32,
    pub rotation: f32,
}

#[spacetimedb::table(name = "pipe", accessor = pipe, public)]
pub struct Pipe {
    #[primary_key]
    #[auto_inc]
    pub id: u32,
    pub x: f32,
    pub gap_y: f32,
    pub speed: f32,
}

#[spacetimedb::table(name = "session", accessor = session, public)]
pub struct Session {
    #[primary_key]
    pub id: u32,
    pub state: String,
    pub round_number: u32,
    pub started_at: u64,
}

#[spacetimedb::table(name = "game_config", accessor = game_config, public)]
pub struct GameConfig {
    #[primary_key]
    pub id: u32,
    pub gravity: f32,
    pub flap_force: f32,
    pub pipe_speed: f32,
    pub pipe_interval_ms: u64,
    pub gap_size: f32,
    pub bird_start_x: f32,
}

// ─── Reducers ─────────────────────────────────────────────────────────────────

#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) {
    log::info!("Flappy Bird module initializing...");

    ctx.db.game_config().insert(GameConfig {
        id: 1,
        gravity: 1800.0,
        flap_force: -500.0,
        pipe_speed: 150.0,
        pipe_interval_ms: 1800,
        gap_size: 160.0,
        bird_start_x: 80.0,
    });

    ctx.db.session().insert(Session {
        id: 1,
        state: "Waiting".to_string(),
        round_number: 0,
        started_at: 0,
    });

    log::info!("Module initialized with default GameConfig and Session.");
}

#[spacetimedb::reducer]
pub fn join_game(ctx: &ReducerContext, username: String, color_hex: String) {
    log::info!("join_game called: identity={:?} username={} color={}", ctx.sender(), username, color_hex);
}

#[spacetimedb::reducer]
pub fn set_ready(ctx: &ReducerContext) {
    log::info!("set_ready called: identity={:?}", ctx.sender());
}

#[spacetimedb::reducer]
pub fn flap(ctx: &ReducerContext) {
    log::info!("flap called: identity={:?}", ctx.sender());
}

#[spacetimedb::reducer]
pub fn request_start(ctx: &ReducerContext) {
    log::info!("request_start called: identity={:?}", ctx.sender());
}

#[spacetimedb::reducer]
pub fn tick(_ctx: &ReducerContext, timestamp: u64) {
    log::info!("tick called: timestamp={}", timestamp);
    // Will become a scheduled reducer in Phase 2
}
