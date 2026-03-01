use spacetimedb::{ReducerContext, Table, Identity, TimeDuration};

// ─── Tables ──────────────────────────────────────────────────────────────────

#[spacetimedb::table(name = "player", accessor = player, public)]
#[derive(Clone)]
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
#[derive(Clone)]
pub struct Bird {
    #[primary_key]
    pub player_identity: Identity,
    pub x: f32,
    pub y: f32,
    pub velocity_y: f32,
    pub rotation: f32,
}

#[spacetimedb::table(name = "pipe", accessor = pipe, public)]
#[derive(Clone)]
pub struct Pipe {
    #[primary_key]
    #[auto_inc]
    pub id: u32,
    pub x: f32,
    pub gap_y: f32,
    pub speed: f32,
}

#[spacetimedb::table(name = "session", accessor = session, public)]
#[derive(Clone)]
pub struct Session {
    #[primary_key]
    pub id: u32,
    pub state: String,
    pub round_number: u32,
    pub started_at: u64,
    pub pipes_spawned: u32,
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

#[spacetimedb::table(name = "round_result", accessor = round_result, public)]
#[derive(Clone)]
pub struct RoundResult {
    #[primary_key]
    #[auto_inc]
    pub id: u32,
    pub winner_identity: Identity,
    pub winner_score: u32,
    pub round_number: u32,
    pub ended_at: u64,
}

#[spacetimedb::table(name = "pipe_passed", accessor = pipe_passed, public)]
pub struct PipePassed {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub pipe_id: u32,
    pub player_identity: Identity,
}

/// Scheduled tick table — not public (clients don't need it).
#[spacetimedb::table(name = "tick_schedule", accessor = tick_schedule, scheduled(tick))]
pub struct TickSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: spacetimedb::ScheduleAt,
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
        pipes_spawned: 0,
    });

    // Start the 20Hz game tick scheduler (50ms interval).
    ctx.db.tick_schedule().insert(TickSchedule {
        scheduled_id: 0,
        scheduled_at: TimeDuration::from_micros(50_000).into(),
    });

    log::info!("Module initialized with GameConfig, Session, and TickSchedule.");
}

#[spacetimedb::reducer]
pub fn tick(ctx: &ReducerContext, _schedule: TickSchedule) {
    const DT: f32 = 0.05; // 50ms fixed timestep

    let session = match ctx.db.session().id().find(1) {
        Some(s) => s,
        None => return,
    };
    if session.state != "Running" {
        return;
    }

    let config = match ctx.db.game_config().id().find(1) {
        Some(c) => c,
        None => return,
    };

    let now_micros = ctx.timestamp.to_micros_since_unix_epoch() as u64;
    let elapsed_ms = (now_micros - session.started_at) / 1000;

    // ── Apply gravity to all living birds ───────────────────────────────────

    let birds: Vec<Bird> = ctx.db.bird().iter().collect();

    for bird in birds {
        let identity = bird.player_identity;
        let is_alive = ctx.db
            .player()
            .identity()
            .find(identity)
            .map_or(false, |p| p.is_alive);
        if !is_alive {
            continue;
        }

        let new_vel = bird.velocity_y + config.gravity * DT;
        let new_y = bird.y + new_vel * DT;
        let new_rot = (new_vel / 10.0).clamp(-30.0, 90.0);

        ctx.db.bird().player_identity().update(Bird {
            velocity_y: new_vel,
            y: new_y,
            rotation: new_rot,
            ..bird
        });
    }

    // ── Pipe spawning ────────────────────────────────────────────────────────

    let expected_pipes = (elapsed_ms / config.pipe_interval_ms) as u32;

    if expected_pipes > session.pipes_spawned {
        let mut new_count = session.pipes_spawned;
        while new_count < expected_pipes {
            // Deterministic gap_y in range [150, 450]
            let gap_y = 150.0 + ((new_count as f32 * 137.5 + 43.0) % 300.0);
            ctx.db.pipe().insert(Pipe {
                id: 0,
                x: 550.0,
                gap_y,
                speed: config.pipe_speed,
            });
            new_count += 1;
        }
        ctx.db.session().id().update(Session {
            pipes_spawned: new_count,
            ..session
        });
    }

    // ── Move pipes left, delete off-screen ──────────────────────────────────

    let pipes: Vec<Pipe> = ctx.db.pipe().iter().collect();
    for pipe in pipes {
        let new_x = pipe.x - config.pipe_speed * DT;
        if new_x < -60.0 {
            let id = pipe.id;
            ctx.db.pipe().id().delete(id);
        } else {
            ctx.db.pipe().id().update(Pipe { x: new_x, ..pipe });
        }
    }

    // ── Collision detection + scoring ────────────────────────────────────────

    // Re-read updated state after gravity + pipe movement
    let birds: Vec<Bird> = ctx.db.bird().iter().collect();
    let pipes: Vec<Pipe> = ctx.db.pipe().iter().collect();
    let gap_size = config.gap_size;

    let mut dead_identities: Vec<Identity> = Vec::new();

    for bird in &birds {
        let player = match ctx.db.player().identity().find(bird.player_identity) {
            Some(p) => p,
            None => continue,
        };
        if !player.is_alive {
            continue;
        }

        // Boundary collision
        if bird.y < 0.0 || bird.y > 640.0 {
            dead_identities.push(bird.player_identity);
            continue;
        }

        let mut hit = false;

        for pipe in &pipes {
            // Bird is 34×24 centered at (bird.x, bird.y)
            // Pipe is 52 wide centered at pipe.x
            let x_overlap = (bird.x - 17.0) < (pipe.x + 26.0)
                && (bird.x + 17.0) > (pipe.x - 26.0);

            if x_overlap {
                let gap_top = pipe.gap_y - gap_size / 2.0;
                let gap_bottom = pipe.gap_y + gap_size / 2.0;
                if (bird.y - 12.0) < gap_top || (bird.y + 12.0) > gap_bottom {
                    hit = true;
                }
            }

            // Score: pipe center has passed behind bird
            if pipe.x < bird.x {
                let already = ctx
                    .db
                    .pipe_passed()
                    .iter()
                    .any(|pp| pp.pipe_id == pipe.id && pp.player_identity == bird.player_identity);
                if !already {
                    ctx.db.pipe_passed().insert(PipePassed {
                        id: 0,
                        pipe_id: pipe.id,
                        player_identity: bird.player_identity,
                    });
                    // Re-read player for latest score
                    if let Some(p) = ctx.db.player().identity().find(bird.player_identity) {
                        ctx.db.player().identity().update(Player {
                            score: p.score + 1,
                            ..p
                        });
                    }
                }
            }
        }

        if hit {
            dead_identities.push(bird.player_identity);
        }
    }

    // Mark dead players
    for identity in dead_identities {
        if let Some(p) = ctx.db.player().identity().find(identity) {
            ctx.db.player().identity().update(Player {
                is_alive: false,
                ..p
            });
        }
    }

    // ── Round-over detection ─────────────────────────────────────────────────

    let session_players: Vec<Player> = ctx
        .db
        .player()
        .iter()
        .filter(|p| p.session_id == 1)
        .collect();

    if !session_players.is_empty() && session_players.iter().all(|p| !p.is_alive) {
        let winner = session_players
            .iter()
            .max_by_key(|p| p.score)
            .cloned()
            .unwrap();

        let current_session = ctx.db.session().id().find(1).unwrap();

        ctx.db.round_result().insert(RoundResult {
            id: 0,
            winner_identity: winner.identity,
            winner_score: winner.score,
            round_number: current_session.round_number,
            ended_at: now_micros,
        });

        ctx.db.session().id().update(Session {
            state: "RoundOver".to_string(),
            ..current_session
        });
    }
}

#[spacetimedb::reducer]
pub fn join_game(ctx: &ReducerContext, username: String, color_hex: String) {
    log::info!("join_game: {:?} username={}", ctx.sender(), username);

    let config = match ctx.db.game_config().id().find(1) {
        Some(c) => c,
        None => return,
    };

    if ctx.db.player().identity().find(ctx.sender()).is_some() {
        ctx.db.player().identity().update(Player {
            identity: ctx.sender(),
            username,
            color_hex,
            session_id: 1,
            is_alive: false,
            score: 0,
            is_ready: false,
        });
    } else {
        ctx.db.player().insert(Player {
            identity: ctx.sender(),
            username,
            color_hex,
            session_id: 1,
            is_alive: false,
            score: 0,
            is_ready: false,
        });
    }

    if ctx.db.bird().player_identity().find(ctx.sender()).is_some() {
        ctx.db.bird().player_identity().update(Bird {
            player_identity: ctx.sender(),
            x: config.bird_start_x,
            y: 320.0,
            velocity_y: 0.0,
            rotation: 0.0,
        });
    } else {
        ctx.db.bird().insert(Bird {
            player_identity: ctx.sender(),
            x: config.bird_start_x,
            y: 320.0,
            velocity_y: 0.0,
            rotation: 0.0,
        });
    }
}

#[spacetimedb::reducer]
pub fn set_ready(ctx: &ReducerContext) {
    log::info!("set_ready: {:?}", ctx.sender());

    if let Some(player) = ctx.db.player().identity().find(ctx.sender()) {
        ctx.db.player().identity().update(Player {
            is_ready: true,
            ..player
        });
    }

    // Auto-start if all players are ready
    let players: Vec<Player> = ctx.db.player().iter().collect();
    if !players.is_empty() && players.iter().all(|p| p.is_ready) {
        do_start_round(ctx);
    }
}

#[spacetimedb::reducer]
pub fn request_start(ctx: &ReducerContext) {
    log::info!("request_start: {:?}", ctx.sender());
    do_start_round(ctx);
}

#[spacetimedb::reducer]
pub fn flap(ctx: &ReducerContext) {
    let session = match ctx.db.session().id().find(1) {
        Some(s) => s,
        None => return,
    };
    if session.state != "Running" {
        return;
    }

    let player = match ctx.db.player().identity().find(ctx.sender()) {
        Some(p) => p,
        None => return,
    };
    if !player.is_alive {
        return;
    }

    let config = match ctx.db.game_config().id().find(1) {
        Some(c) => c,
        None => return,
    };

    if let Some(bird) = ctx.db.bird().player_identity().find(ctx.sender()) {
        ctx.db.bird().player_identity().update(Bird {
            velocity_y: config.flap_force,
            ..bird
        });
    }
}

/// Reset session to Waiting when a client connects and the session is stuck in
/// RoundOver with no players present (e.g. fresh dev restart hitting stale state).
#[spacetimedb::reducer(client_connected)]
pub fn on_connect(ctx: &ReducerContext) {
    let session = match ctx.db.session().id().find(1) {
        Some(s) => s,
        None => return,
    };
    if session.state != "RoundOver" {
        return;
    }
    let player_count = ctx.db.player().iter().count();
    if player_count == 0 {
        log::info!("on_connect: resetting stale RoundOver session to Waiting");
        ctx.db.session().id().update(Session {
            state: "Waiting".to_string(),
            started_at: 0,
            pipes_spawned: 0,
            ..session
        });
        let pipe_ids: Vec<u32> = ctx.db.pipe().iter().map(|p| p.id).collect();
        for id in pipe_ids {
            ctx.db.pipe().id().delete(id);
        }
        let pp_ids: Vec<u64> = ctx.db.pipe_passed().iter().map(|pp| pp.id).collect();
        for id in pp_ids {
            ctx.db.pipe_passed().id().delete(id);
        }
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn do_start_round(ctx: &ReducerContext) {
    log::info!("do_start_round: executing");
    let config = match ctx.db.game_config().id().find(1) {
        Some(c) => c,
        None => return,
    };
    let session = match ctx.db.session().id().find(1) {
        Some(s) => s,
        None => return,
    };

    let now_micros = ctx.timestamp.to_micros_since_unix_epoch() as u64;

    ctx.db.session().id().update(Session {
        state: "Running".to_string(),
        round_number: session.round_number + 1,
        started_at: now_micros,
        pipes_spawned: 0,
        ..session
    });

    // Reset all birds to starting position
    let birds: Vec<Bird> = ctx.db.bird().iter().collect();
    for bird in birds {
        ctx.db.bird().player_identity().update(Bird {
            x: config.bird_start_x,
            y: 320.0,
            velocity_y: 0.0,
            rotation: 0.0,
            ..bird
        });
    }

    // Set all players alive, reset scores and ready state
    let players: Vec<Player> = ctx.db.player().iter().collect();
    for player in players {
        ctx.db.player().identity().update(Player {
            is_alive: true,
            score: 0,
            is_ready: false,
            ..player
        });
    }

    // Delete all pipes
    let pipe_ids: Vec<u32> = ctx.db.pipe().iter().map(|p| p.id).collect();
    for id in pipe_ids {
        ctx.db.pipe().id().delete(id);
    }

    // Delete all PipePassed records
    let pp_ids: Vec<u64> = ctx.db.pipe_passed().iter().map(|pp| pp.id).collect();
    for id in pp_ids {
        ctx.db.pipe_passed().id().delete(id);
    }
}
