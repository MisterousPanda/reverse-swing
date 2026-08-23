use std::net::SocketAddr;
use std::path::PathBuf;

use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use physics::{challenges, lore, simulate, BowlInput, Challenge};
use serde::Serialize;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

#[derive(Serialize)]
struct LoreEntry {
    id: &'static str,
    text: &'static str,
}

#[derive(Serialize)]
struct PreviewResponse {
    result: physics::BowlResult,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "server=info,tower_http=info".into()),
        )
        .init();

    let web = web_dir();
    let index = web.join("index.html");
    tracing::info!(path = %web.display(), "serving bowling studio");

    let api = Router::new()
        .route("/health", get(health))
        .route("/bowl", post(bowl))
        .route("/preview", post(preview))
        .route("/challenges", get(list_challenges))
        .route("/lore", get(list_lore));

    let app = Router::new()
        .nest("/api", api)
        .fallback_service(ServeDir::new(&web).not_found_service(ServeFile::new(index)))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(7474);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind reverse-swing port");
    tracing::info!("Reverse Swing at http://{addr}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown())
        .await
        .expect("server");
}

async fn shutdown() {
    let _ = tokio::signal::ctrl_c().await;
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "ok": true, "game": "reverse-swing" }))
}

async fn bowl(Json(input): Json<BowlInput>) -> impl IntoResponse {
    Json(simulate(input))
}

async fn preview(Json(input): Json<BowlInput>) -> impl IntoResponse {
    Json(PreviewResponse {
        result: simulate(input),
    })
}

async fn list_challenges() -> Json<Vec<Challenge>> {
    Json(challenges())
}

async fn list_lore() -> Json<Vec<LoreEntry>> {
    Json(
        lore()
            .into_iter()
            .map(|(id, text)| LoreEntry { id, text })
            .collect(),
    )
}

fn web_dir() -> PathBuf {
    if let Ok(path) = std::env::var("REVERSE_SWING_WEB") {
        return PathBuf::from(path);
    }
    let here = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidates = [
        here.join("../../web"),
        here.join("../../../web"),
        PathBuf::from("web"),
    ];
    for path in candidates {
        if path.join("index.html").exists() {
            return path;
        }
    }
    here.join("../../web")
}

#[allow(dead_code)]
fn not_found() -> StatusCode {
    StatusCode::NOT_FOUND
}
